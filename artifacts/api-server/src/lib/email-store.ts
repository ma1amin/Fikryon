import { randomBytes, randomUUID, createHmac } from "node:crypto";

export interface SqlPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  connect(): Promise<{ query: SqlPool["query"]; release(): void }>;
}
export type Language = "ar" | "en";
export type JobKind = "admin" | "acknowledgement" | "launch";
export interface EmailJob {
  id: string;
  subscriber_id: string;
  kind: JobKind;
  attempts: number;
  lease_id: string;
  email: string;
  lang: Language;
  unsubscribe_token: string;
  created_at: Date;
  unsubscribed_at: Date | null;
}
export class RateLimitError extends Error {}

export class EmailStore {
  constructor(
    private pool: SqlPool,
    private hashSecret: string,
  ) {}

  async subscribe(email: string, lang: Language, ip: string, now = new Date()) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Persist the IP counter even when rejecting the request.
      const ipKey = createHmac("sha256", this.hashSecret)
        .update(ip)
        .digest("hex");
      const hour = Math.floor(now.getTime() / 3600000);
      const rate = await client.query(
        `INSERT INTO email_throttle (key,count,expires_at)
        VALUES ($1,1,$2) ON CONFLICT (key) DO UPDATE
        SET count = email_throttle.count + 1 RETURNING count`,
        [`ip:${ipKey}:${hour}`, new Date((hour + 1) * 3600000)],
      );
      if (rate.rows[0].count > 5) {
        await client.query("COMMIT");
        throw new RateLimitError("Too many submissions");
      }
      const id = randomUUID();
      const inserted = await client.query(
        `INSERT INTO subscribers
        (id,email,lang,unsubscribe_token,created_at) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (email) DO NOTHING RETURNING id`,
        [id, email, lang, randomBytes(32).toString("hex"), now],
      );
      if (inserted.rows.length) {
        // Unique subscribers/jobs also prevent repeated acknowledgements across days.
        const day = Math.floor(now.getTime() / 86400000);
        const emailKey = createHmac("sha256", this.hashSecret)
          .update(email)
          .digest("hex");
        await client.query(
          `INSERT INTO email_throttle (key,count,expires_at)
          VALUES ($1,1,$2) ON CONFLICT (key) DO NOTHING`,
          [`email:${emailKey}:${day}`, new Date((day + 1) * 86400000)],
        );
        for (const kind of ["admin", "acknowledgement"] as const) {
          await client.query(
            `INSERT INTO email_jobs (id,subscriber_id,kind,available_at)
            VALUES ($1,$2,$3,$4) ON CONFLICT (subscriber_id,kind) DO NOTHING`,
            [randomUUID(), id, kind, now],
          );
        }
      }
      const existing = inserted.rows.length
        ? undefined
        : await client.query(
            "SELECT unsubscribed_at FROM subscribers WHERE email=$1",
            [email],
          );
      const registered =
        inserted.rows.length > 0 || existing?.rows[0]?.unsubscribed_at === null;
      await client.query("COMMIT");
      return {
        created: inserted.rows.length > 0,
        subscriberId: inserted.rows.length ? id : undefined,
        registered,
      };
    } catch (error) {
      if (!(error instanceof RateLimitError)) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async enqueueLaunch(now: Date, launchDate: Date) {
    if (now < launchDate) return;
    // Bound work per invocation even when the subscriber list becomes large.
    await this.pool.query(
      `INSERT INTO email_jobs (id,subscriber_id,kind,available_at)
      SELECT gen_random_uuid(),s.id,'launch',$1 FROM subscribers s
      WHERE s.unsubscribed_at IS NULL AND NOT EXISTS
        (SELECT 1 FROM email_jobs j WHERE j.subscriber_id=s.id AND j.kind='launch')
      ORDER BY s.created_at LIMIT 500
      ON CONFLICT (subscriber_id,kind) DO NOTHING`,
      [now],
    );
  }

  async claim(now: Date, subscriberId?: string): Promise<EmailJob | undefined> {
    const lease = randomUUID();
    const result = await this.pool.query(
      `WITH candidate AS (
      SELECT j.id FROM email_jobs j JOIN subscribers s ON s.id=j.subscriber_id
      WHERE j.sent_at IS NULL AND j.cancelled_at IS NULL AND j.available_at <= $1
        AND (j.lease_until IS NULL OR j.lease_until <= $1)
        AND ($4::uuid IS NULL OR j.subscriber_id=$4)
        AND (j.kind='admin' OR s.unsubscribed_at IS NULL)
      ORDER BY j.available_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1
    ), claimed AS (
      UPDATE email_jobs j SET lease_id=$2,lease_until=$3,attempts=j.attempts+1
      FROM candidate c WHERE j.id=c.id RETURNING j.*
    ) SELECT c.*,s.email,s.lang,s.unsubscribe_token,s.created_at,s.unsubscribed_at
      FROM claimed c JOIN subscribers s ON s.id=c.subscriber_id`,
      [now, lease, new Date(now.getTime() + 120000), subscriberId ?? null],
    );
    return result.rows[0] as EmailJob | undefined;
  }

  async complete(job: EmailJob, now: Date) {
    await this.pool.query(
      `UPDATE email_jobs SET sent_at=$3,lease_id=NULL,lease_until=NULL,last_error=NULL
      WHERE id=$1 AND lease_id=$2`,
      [job.id, job.lease_id, now],
    );
  }
  async fail(job: EmailJob, now: Date, code: string) {
    const delay = Math.min(86400000, 300000 * 2 ** Math.min(job.attempts, 8));
    await this.pool.query(
      `UPDATE email_jobs SET available_at=$3,lease_id=NULL,lease_until=NULL,last_error=$4
      WHERE id=$1 AND lease_id=$2`,
      [job.id, job.lease_id, new Date(now.getTime() + delay), code],
    );
  }
  async stillActive(job: EmailJob) {
    if (job.kind === "admin") return true;
    const result = await this.pool.query(
      "SELECT unsubscribed_at FROM subscribers WHERE id=$1",
      [job.subscriber_id],
    );
    return result.rows.length > 0 && result.rows[0].unsubscribed_at === null;
  }
  async cancel(job: EmailJob, now: Date) {
    await this.pool.query(
      `UPDATE email_jobs SET cancelled_at=$3,lease_id=NULL,lease_until=NULL
      WHERE id=$1 AND lease_id=$2`,
      [job.id, job.lease_id, now],
    );
  }
  async unsubscribe(token: string, now = new Date()) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE subscribers SET unsubscribed_at=COALESCE(unsubscribed_at,$2)
        WHERE unsubscribe_token=$1 RETURNING id`,
        [token, now],
      );
      if (result.rows.length) {
        await client.query(
          `UPDATE email_jobs SET cancelled_at=$2
          WHERE subscriber_id=$1 AND kind != 'admin' AND sent_at IS NULL`,
          [result.rows[0].id, now],
        );
      }
      await client.query("COMMIT");
      return result.rows.length > 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async cleanup(now: Date) {
    await this.pool.query("DELETE FROM email_throttle WHERE expires_at < $1", [
      now,
    ]);
  }
}

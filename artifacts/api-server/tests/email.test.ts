import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import express from "express";
import nodemailer from "nodemailer";
import { PGlite } from "@electric-sql/pglite";
import {
  EmailStore,
  RateLimitError,
  type SqlPool,
} from "../src/lib/email-store";
import {
  buildMessage,
  deliverJobs,
  mailEnabled,
  productionSiteUrl,
  smtpOptions,
} from "../src/lib/email-delivery";
import { emailRouter, validCronAuthorization } from "../src/routes/email";
import { LAUNCH_DATE } from "@workspace/site-config";

const beforeLaunch = new Date("2026-10-14T09:00:00Z");
const secret = "test-secret-with-no-real-credentials";

async function fixture(t: TestContext) {
  const db = new PGlite();
  const migration = await readFile(
    new URL(
      "../../../lib/db/drizzle/0000_vengeful_golden_guardian.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
  t.after(() => db.close());
  let tail = Promise.resolve();
  async function acquire() {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = tail;
    tail = previous.then(() => next);
    await previous;
    return release;
  }
  const rawQuery: SqlPool["query"] = async (sql, values) =>
    db.query(sql, values);
  const pool: SqlPool = {
    query: async (sql, values) => {
      const release = await acquire();
      try {
        return await rawQuery(sql, values);
      } finally {
        release();
      }
    },
    connect: async () => {
      const release = await acquire();
      return { query: rawQuery, release };
    },
  };
  return { db, store: new EmailStore(pool, secret) };
}
async function endpoint(
  t: TestContext,
  store: EmailStore,
  options: { enabled?: boolean; sender?: any; settings?: any } = {},
) {
  const app = express();
  app.use(express.json({ limit: "4kb" }));
  const messages: any[] = [];
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const sender = options.sender ?? {
    sendMail: async (mail: any) => {
      const result = await transport.sendMail(mail);
      messages.push(JSON.parse(result.message.toString()));
      return result;
    },
  };
  app.use(
    "/api",
    emailRouter({
      store: () => store,
      sender: () => sender,
      settings:
        options.settings ??
        (() => ({
          enabled: options.enabled ?? true,
          secret,
          siteUrl: "https://fikryon.example",
        })),
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${address.port}/api`;
  const post = (path: string, body: any) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { base, post, messages };
}

test("STARTTLS, certificate validation, preview isolation and URL configuration", () => {
  const options = smtpOptions({
    SMTP_USER: "sender@example.test",
    SMTP_PASS: "dummy",
  });
  assert.equal(options.port, 587);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.throws(() => smtpOptions({}));
  assert.equal(
    mailEnabled({ MAIL_ENABLED: "true", VERCEL_ENV: "preview" }),
    false,
  );
  assert.equal(
    mailEnabled({ MAIL_ENABLED: "true", VERCEL_ENV: "production" }),
    true,
  );
  assert.equal(mailEnabled({}), false);
  assert.equal(
    productionSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "fikryon.vercel.app" }),
    "https://fikryon.vercel.app",
  );
  assert.throws(() =>
    productionSiteUrl({
      PUBLIC_SITE_URL: "http://example.com",
      NODE_ENV: "production",
    }),
  );
});

test("actual HTTP signup sends admin alert and localized acknowledgement, normalizes email", async (t) => {
  const { store, db } = await fixture(t);
  const api = await endpoint(t, store);
  for (const lang of ["ar", "en"]) {
    const response = await api.post("/subscribe", {
      email: `  ${lang.toUpperCase()}@EXAMPLE.COM  `,
      lang,
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { registered: true });
  }
  assert.equal(api.messages.length, 4);
  assert.equal(
    api.messages.filter((m) => m.to[0].address === "info@fikryon.com").length,
    2,
  );
  const arabic = api.messages.find((m) => m.to[0].address === "ar@example.com");
  assert.match(arabic.subject, /فيكريون/);
  assert.match(arabic.html, /dir="rtl"/);
  const english = api.messages.find(
    (m) => m.to[0].address === "en@example.com",
  );
  assert.match(english.text, /notify you when we launch/);
  assert.match(english.text, /unsubscribe\?token=/);
  assert.equal(
    (await db.query("SELECT * FROM email_jobs WHERE sent_at IS NOT NULL")).rows
      .length,
    4,
  );
});

test("invalid input and honeypot never insert or send", async (t) => {
  const { store, db } = await fixture(t);
  const api = await endpoint(t, store);
  for (const body of [
    { email: "bad", lang: "en" },
    { email: "a@example.com", lang: "fr" },
    { email: "a\r\nb@example.com", lang: "en" },
  ]) {
    assert.equal((await api.post("/subscribe", body)).status, 400);
  }
  assert.equal(
    (
      await api.post("/subscribe", {
        email: "a@example.com",
        lang: "en",
        website: "bot",
      })
    ).status,
    200,
  );
  assert.equal((await db.query("SELECT * FROM subscribers")).rows.length, 0);
  assert.equal(api.messages.length, 0);
});

test("unavailable configuration and disabled delivery don't register users", async (t) => {
  const { store, db } = await fixture(t);
  const disabled = await endpoint(t, store, { enabled: false });
  assert.equal(
    (await disabled.post("/subscribe", { email: "a@example.com", lang: "en" }))
      .status,
    503,
  );
  const missing = await endpoint(t, store, {
    settings: () => {
      throw new Error("Missing configuration");
    },
  });
  assert.equal(
    (await missing.post("/subscribe", { email: "a@example.com", lang: "en" }))
      .status,
    503,
  );
  assert.equal((await db.query("SELECT * FROM subscribers")).rows.length, 0);
});

test("concurrent duplicate signups create exactly one subscriber and two unique jobs", async (t) => {
  const { store, db } = await fixture(t);
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      store.subscribe("a@example.com", "en", `ip-${i}`, beforeLaunch),
    ),
  );
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal((await db.query("SELECT * FROM subscribers")).rows.length, 1);
  assert.equal((await db.query("SELECT * FROM email_jobs")).rows.length, 2);
  await store.subscribe(
    "a@example.com",
    "en",
    "new-day",
    new Date(beforeLaunch.getTime() + 86400000),
  );
  assert.equal((await db.query("SELECT * FROM email_jobs")).rows.length, 2);
});

test("IP throttling persists rejected attempts and resets next hour", async (t) => {
  const { store, db } = await fixture(t);
  for (let i = 0; i < 5; i++)
    await store.subscribe(`${i}@example.com`, "en", "same-ip", beforeLaunch);
  await assert.rejects(
    store.subscribe("six@example.com", "en", "same-ip", beforeLaunch),
    RateLimitError,
  );
  assert.equal((await db.query("SELECT * FROM subscribers")).rows.length, 5);
  assert.equal(
    (await db.query("SELECT count FROM email_throttle WHERE key LIKE 'ip:%'"))
      .rows[0].count,
    6,
  );
  await store.subscribe(
    "six@example.com",
    "en",
    "same-ip",
    new Date(beforeLaunch.getTime() + 3600000),
  );
  assert.equal((await db.query("SELECT * FROM subscribers")).rows.length, 6);
});

test("SMTP partial failure preserves subscription and retries only failed mail", async (t) => {
  const { store, db } = await fixture(t);
  let fail = true;
  const sent: string[] = [];
  const sender = {
    sendMail: async (mail: any) => {
      if (mail.to === "info@fikryon.com" && fail)
        throw Object.assign(new Error("private SMTP detail"), {
          code: "ETIMEDOUT",
        });
      sent.push(mail.to);
    },
  };
  const api = await endpoint(t, store, { sender });
  assert.equal(
    (await api.post("/subscribe", { email: "a@example.com", lang: "en" }))
      .status,
    201,
  );
  assert.deepEqual(sent, ["a@example.com"]);
  assert.equal(
    (await db.query("SELECT * FROM email_jobs WHERE last_error='ETIMEDOUT'"))
      .rows.length,
    1,
  );
  fail = false;
  await deliverJobs({
    store,
    sender,
    siteUrl: "https://example.com",
    now: () => new Date(Date.now() + 86400000),
  });
  assert.deepEqual(sent.sort(), ["a@example.com", "info@fikryon.com"]);
  assert.equal(
    (await db.query("SELECT * FROM email_jobs WHERE sent_at IS NOT NULL")).rows
      .length,
    2,
  );
});

test("database leases separate workers and recover after expiration", async (t) => {
  const { store } = await fixture(t);
  await store.subscribe("a@example.com", "en", "ip", beforeLaunch);
  const [a, b] = await Promise.all([
    store.claim(beforeLaunch),
    store.claim(beforeLaunch),
  ]);
  assert(a && b);
  assert.notEqual(a.id, b.id);
  assert.equal(await store.claim(beforeLaunch), undefined);
  const later = new Date(beforeLaunch.getTime() + 121000);
  const reclaimed = await store.claim(later);
  assert(reclaimed);
  assert.equal(reclaimed.attempts, 2);
  assert.notEqual(reclaimed.lease_id, a.lease_id);
  await store.complete(reclaimed.id === a.id ? a : b, later);
  // A worker with an expired lease cannot acknowledge the new owner's job.
  const active = await store.claim(later);
  assert(active);
  assert.notEqual(active.id, reclaimed.id);
});

test("launch jobs are queued at the shared launch instant, once per active subscriber", async (t) => {
  const { store, db } = await fixture(t);
  await store.subscribe("active@example.com", "en", "ip-1", beforeLaunch);
  await store.subscribe("unsub@example.com", "ar", "ip-2", beforeLaunch);
  const token = (
    await db.query(
      "SELECT unsubscribe_token FROM subscribers WHERE email='unsub@example.com'",
    )
  ).rows[0].unsubscribe_token as string;
  await store.unsubscribe(token);
  const instant = new Date(LAUNCH_DATE);
  await store.enqueueLaunch(new Date(instant.getTime() - 1), instant);
  assert.equal(
    (await db.query("SELECT * FROM email_jobs WHERE kind='launch'")).rows
      .length,
    0,
  );
  await Promise.all([
    store.enqueueLaunch(instant, instant),
    store.enqueueLaunch(instant, instant),
  ]);
  assert.equal(
    (await db.query("SELECT * FROM email_jobs WHERE kind='launch'")).rows
      .length,
    1,
  );
});

test("daily processing is capped at 50 and respects its processing budget", async (t) => {
  const { store, db } = await fixture(t);
  for (let i = 0; i < 30; i++)
    await store.subscribe(`${i}@example.com`, "en", `ip-${i}`, beforeLaunch);
  const stats = await deliverJobs({
    store,
    sender: { sendMail: async () => {} },
    siteUrl: "https://example.com",
    now: () => beforeLaunch,
  });
  assert.equal(stats.sent, 50);
  assert.equal(
    (await db.query("SELECT * FROM email_jobs WHERE sent_at IS NULL")).rows
      .length,
    10,
  );
  let time = beforeLaunch.getTime();
  const limited = await deliverJobs({
    store,
    sender: {
      sendMail: async () => {
        time += 20000;
      },
    },
    siteUrl: "https://example.com",
    now: () => new Date(time),
  });
  assert.equal(limited.sent, 2);
});

test("unsubscribe needs a POST confirmation and cancels all unsent subscriber messages", async (t) => {
  const { store, db } = await fixture(t);
  await store.subscribe("a@example.com", "ar", "ip", beforeLaunch);
  const token = (await db.query("SELECT unsubscribe_token FROM subscribers"))
    .rows[0].unsubscribe_token as string;
  const api = await endpoint(t, store);
  assert.equal(
    (await fetch(`${api.base}/unsubscribe?token=${token}`)).status,
    404,
  );
  assert.equal(
    (
      await db.query(
        "SELECT * FROM subscribers WHERE unsubscribed_at IS NOT NULL",
      )
    ).rows.length,
    0,
  );
  assert.equal((await api.post("/unsubscribe", { token })).status, 200);
  assert.equal((await api.post("/unsubscribe", { token })).status, 200);
  assert.equal((await api.post("/unsubscribe", { token: "bad" })).status, 400);
  const repeated = await api.post("/subscribe", {
    email: "a@example.com",
    lang: "ar",
  });
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), { registered: false });
  const messages: string[] = [];
  await deliverJobs({
    store,
    sender: {
      sendMail: async (mail) => {
        messages.push(String(mail.to));
      },
    },
    siteUrl: "https://example.com",
    now: () => new Date(),
  });
  assert.deepEqual(messages, ["info@fikryon.com"]);
});

test("cron rejects missing/wrong authorization, allows correct secret", async (t) => {
  const { store } = await fixture(t);
  const api = await endpoint(t, store, { enabled: false });
  assert.equal(validCronAuthorization("Bearer wrong", secret), false);
  assert.equal((await fetch(`${api.base}/cron/email-delivery`)).status, 401);
  assert.equal(
    (
      await fetch(`${api.base}/cron/email-delivery`, {
        headers: { authorization: "Bearer wrong" },
      })
    ).status,
    401,
  );
  const response = await fetch(`${api.base}/cron/email-delivery`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).disabled, true);
});

test("message templates escape subscriber data and retain a stable message ID", () => {
  const job: any = {
    id: "job-id",
    kind: "admin",
    email: "<script>@example.com",
    lang: "ar",
    created_at: beforeLaunch,
    unsubscribe_token: "a".repeat(64),
  };
  const mail = buildMessage(job, "https://example.com");
  assert(!String(mail.html).includes("<script>"));
  assert.equal(mail.messageId, "<job-id@fikryon.com>");
});

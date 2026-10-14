# FIKRYON signup and launch emails

The form calls `POST /api/subscribe` with an email, `ar`/`en` language, and an empty
honeypot field. Successful registration is persisted before email delivery:
the subscriber receives a localized acknowledgement and `info@fikryon.com`
receives an admin alert. HTTP success means registration was saved, not that the
recipient's inbox accepted the messages. SMTP failures remain queued for retry.

## Production environment

Set these in Vercel → Fikryon → Settings → Environment Variables:

| Variable | Value | Scope |
| --- | --- | --- |
| `DATABASE_URL` | Neon production PostgreSQL connection URL | Production; sensitive |
| `DATABASE_URL` | Separate Neon preview branch connection URL | Preview; sensitive |
| `SMTP_USER` | `info@fikryon.com` | Production |
| `SMTP_PASS` | Mailbox password, entered directly in Vercel | Production; sensitive |
| `CRON_SECRET` | Random 32-byte secret | Production; sensitive |
| `PUBLIC_SITE_URL` | Canonical HTTPS production URL | Production |
| `MAIL_ENABLED` | `false` until the controlled SMTP test passes, then `true` | Production |
| `MAIL_ENABLED` | `false` | Preview |

No secret uses a `VITE_` prefix or belongs in source control. `.env` files are
ignored. Preview deployments cannot send email, even if `MAIL_ENABLED` is set to
`true`. Local testing can explicitly enable mail; mock transports in automated
tests never contact real recipients.

The SMTP host is `webhost.dynadot.com`, port 587, with mandatory STARTTLS and
certificate verification. IMAP is not used. Without `PUBLIC_SITE_URL`, Vercel's
`VERCEL_PROJECT_PRODUCTION_URL` is used. Configure a publicly accessible canonical
domain before rollout so recipients can visit the site and unsubscribe.

## Database setup

Create a Neon project near Vercel's API region and use the existing Drizzle schema.
Apply the checked-in versioned migration with `DATABASE_URL` set securely:

```sh
pnpm --filter @workspace/db run migrate
```

This creates `subscribers`, `email_jobs`, `email_throttle`, and Drizzle's migration
journal. Do not run schema migration commands automatically in every API request
or every frontend build. After migrating production, create a separate empty
preview branch with the same schema. Future migrations must also be applied there.
For future schema changes, run `pnpm --filter @workspace/db run generate`, review
the SQL, and apply it before deploying code that requires those changes.

## Delivery behavior

- Emails are normalized and unique. Repeated submissions don't create new jobs
  or send another acknowledgement, including on later days.
- Five submissions per IP per hour are allowed; IP addresses are stored only as
  keyed hashes. Subscriber uniqueness also limits acknowledgements to at most
  one per address per day. Submitted addresses are not written to application logs.
- Email jobs have unique subscriber/type keys and two-minute leases. Concurrent
  workers skip leased jobs. Expired leases are recoverable after a worker stops.
- Retry delay grows from ten minutes to one day. Successful jobs are not resent.
  An ambiguous SMTP disconnect or a database failure after sending can cause a
  duplicate; SMTP cannot provide an exactly-once guarantee.
- Acknowledgements and launch messages include an unsubscribe URL. GET only opens
  a confirmation page. POST confirms the action and cancels pending subscriber
  messages. Already sent messages cannot be recalled. Duplicate form submissions
  do not reactivate an unsubscribed address.

## Launch scheduler

The shared `@workspace/site-config` package sets the launch to
`2026-11-03T00:00:00+03:00`. Both the countdown and backend use this instant.
The root `vercel.json` schedules `/api/cron/email-delivery` daily at `0 21 * * *`
(21:00 UTC / midnight Riyadh). The endpoint requires `Authorization: Bearer
<CRON_SECRET>`; Vercel supplies this header automatically.

Before launch, the worker retries pending signup emails. At or after launch it
enqueues launch messages for active subscribers, at most 500 new jobs per run.
Each run processes at most 50 jobs and reserves time within a 45-second delivery
budget. More jobs continue the next day. Hobby cron may start within the scheduled
hour; this setup does not promise a midnight inbox delivery for every subscriber.
The API function has a 60-second maximum duration. SMTP timeouts are bounded and
unprocessed jobs stay durable. Changing the launch date requires redeployment.

To inspect queue status, query counts grouped by `kind`, `sent_at`, and `last_error`
in Neon. Logs report job totals and sanitized error codes. To retry a batch
manually, invoke the cron URL with the secret authorization header from a trusted
terminal; do not paste the secret into URLs or shared logs.

## Verification and activation

```sh
pnpm --filter @workspace/api-server test
pnpm run typecheck
pnpm -r --filter './artifacts/**' run build
vercel dev -L
```

Tests use PostgreSQL-compatible PGlite with the real migration and Nodemailer's
JSON transport: no live SMTP is contacted. They cover duplicate/concurrent signup,
normalization, validation, honeypots, throttling, partial SMTP failures, retry and
lease recovery, launch timing, batch limits, unsubscribe confirmation, preview
isolation, and scheduler authorization.

Keep `MAIL_ENABLED=false` until SMTP authentication and a controlled send are
verified. Use `info@fikryon.com` as the controlled recipient; confirm both test
messages arrive. Then enable production mail and redeploy. Verify a real signup
creates exactly one subscriber and two sent jobs; repeated signup should send
nothing. Verify unauthorized cron requests return 401. Leave preview mail off.

An SMTP accepted response verifies handoff to Dynadot, not inbox placement. Check
the mailbox and spam folder, and use Dynadot's required SPF/DKIM configuration.

References: [Dynadot SMTP](https://www.dynadot.com/help/question/basic-email-outlook),
[Nodemailer STARTTLS](https://nodemailer.com/smtp),
[Vercel Hobby scheduling](https://vercel.com/docs/cron-jobs/usage-and-pricing).

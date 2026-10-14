import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import { CONTACT_EMAIL, LAUNCH_DATE } from "@workspace/site-config";
import type { EmailJob } from "./email-store";
import { EmailStore } from "./email-store";

export interface MailSender {
  sendMail(message: SendMailOptions): Promise<unknown>;
}
export function smtpOptions(env: NodeJS.ProcessEnv = process.env) {
  if (!env.SMTP_USER || !env.SMTP_PASS)
    throw new Error("SMTP credentials are required");
  return {
    host: "webhost.dynadot.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" as const },
    dnsTimeout: 3000,
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 6000,
    disableFileAccess: true,
    disableUrlAccess: true,
  };
}
export function mailEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.MAIL_ENABLED === "true" && env.VERCEL_ENV !== "preview";
}
export function productionSiteUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured =
    env.PUBLIC_SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "");
  if (!configured)
    throw new Error("PUBLIC_SITE_URL is required outside Vercel");
  const url = new URL(configured);
  if (
    url.protocol !== "https:" &&
    !(env.NODE_ENV !== "production" && url.hostname === "localhost")
  ) {
    throw new Error("PUBLIC_SITE_URL must use HTTPS");
  }
  if (url.username || url.password)
    throw new Error("PUBLIC_SITE_URL must not contain credentials");
  return url.origin;
}
export function createMailSender() {
  return nodemailer.createTransport(smtpOptions());
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function buildMessage(job: EmailJob, siteUrl: string): SendMailOptions {
  const ar = job.lang === "ar";
  const unsubscribe = `${siteUrl}/unsubscribe?token=${encodeURIComponent(job.unsubscribe_token)}&lang=${job.lang}`;
  let subject: string, text: string;
  if (job.kind === "admin") {
    subject = "FIKRYON — New launch subscriber";
    text = `A new subscriber joined the FIKRYON launch list.\n\nEmail: ${job.email}\nLanguage: ${job.lang}\nRegistered: ${new Date(job.created_at).toISOString()}`;
  } else if (job.kind === "acknowledgement") {
    subject = ar
      ? "فيكريون — تم تسجيلك في قائمة الإطلاق"
      : "FIKRYON — You're on our launch list";
    text = ar
      ? `شكرًا لاهتمامك بفيكريون! تم تسجيل بريدك الإلكتروني وسنرسل لك إشعارًا عند الإطلاق.\n\n${siteUrl}\n\nلإلغاء الاشتراك: ${unsubscribe}`
      : `Thank you for your interest in FIKRYON! Your email is registered and we'll notify you when we launch.\n\n${siteUrl}\n\nUnsubscribe: ${unsubscribe}`;
  } else {
    subject = ar ? "فيكريون — انطلقنا!" : "FIKRYON — We've launched!";
    text = ar
      ? `انطلقت فيكريون للابتكار والتقنية! شكرًا لاهتمامك، ندعوك لزيارة موقعنا:\n\n${siteUrl}\n\nلإلغاء الاشتراك: ${unsubscribe}`
      : `FIKRYON Innovation & Technology has launched! Thank you for your interest. Visit our website:\n\n${siteUrl}\n\nUnsubscribe: ${unsubscribe}`;
  }
  return {
    from: `FIKRYON <${CONTACT_EMAIL}>`,
    to: job.kind === "admin" ? CONTACT_EMAIL : job.email,
    replyTo: CONTACT_EMAIL,
    subject,
    text,
    html: `<html lang="${ar && job.kind !== "admin" ? "ar" : "en"}" dir="${ar && job.kind !== "admin" ? "rtl" : "ltr"}"><body><p style="white-space:pre-line">${escapeHtml(text)}</p>${job.kind === "admin" ? "" : `<p><a href="${escapeHtml(siteUrl)}">FIKRYON</a></p><p><a href="${escapeHtml(unsubscribe)}">${ar ? "إلغاء الاشتراك" : "Unsubscribe"}</a></p>`}</body></html>`,
    messageId: `<${job.id}@fikryon.com>`,
    ...(job.kind === "admin"
      ? {}
      : { headers: { "List-Unsubscribe": `<${unsubscribe}>` } }),
  };
}

export async function deliverJobs(options: {
  store: EmailStore;
  sender: MailSender;
  siteUrl: string;
  subscriberId?: string;
  limit?: number;
  budgetMs?: number;
  now?: () => Date;
  reportError?: (code: string) => void;
}) {
  const { store, sender, siteUrl, subscriberId } = options;
  const clock = options.now ?? (() => new Date());
  const deadline = clock().getTime() + (options.budgetMs ?? 45000);
  let sent = 0,
    failed = 0,
    cancelled = 0;
  for (let count = 0; count < (options.limit ?? 50); count++) {
    // Reserve the SMTP timeout plus database acknowledgement time.
    if (clock().getTime() + 16000 > deadline) break;
    const job = await store.claim(clock(), subscriberId);
    if (!job) break;
    if (!(await store.stillActive(job))) {
      await store.cancel(job, clock());
      cancelled++;
      continue;
    }
    try {
      await sender.sendMail(buildMessage(job, siteUrl));
      await store.complete(job, clock());
      sent++;
    } catch (error) {
      const candidate =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "EMAIL_FAILED";
      // Store/log only a bounded code, never an SMTP response containing addresses or credentials.
      const code = /^[A-Z0-9_]{1,40}$/.test(candidate)
        ? candidate
        : "EMAIL_FAILED";
      await store.fail(job, clock(), code);
      options.reportError?.(code);
      failed++;
    }
  }
  return { sent, failed, cancelled };
}

export async function runEmailCron(
  store: EmailStore,
  sender: MailSender,
  siteUrl: string,
  now = new Date(),
) {
  await store.cleanup(now);
  await store.enqueueLaunch(now, new Date(LAUNCH_DATE));
  return deliverJobs({ store, sender, siteUrl });
}

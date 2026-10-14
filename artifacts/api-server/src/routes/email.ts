import { Router, type Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { getPool } from "@workspace/db";
import { SubscribeBody, UnsubscribeBody } from "@workspace/api-zod";
import { EmailStore, RateLimitError } from "../lib/email-store";
import {
  createMailSender,
  deliverJobs,
  mailEnabled,
  productionSiteUrl,
  runEmailCron,
  smtpOptions,
  type MailSender,
} from "../lib/email-delivery";
import { logger } from "../lib/logger";

interface Settings {
  enabled: boolean;
  secret: string;
  siteUrl: string;
}
interface Dependencies {
  store: () => EmailStore;
  sender: () => MailSender;
  settings: () => Settings;
}
const defaults: Dependencies = {
  store: () => new EmailStore(getPool(), process.env.CRON_SECRET!),
  sender: createMailSender,
  settings: () => {
    if (!process.env.CRON_SECRET || !process.env.DATABASE_URL)
      throw new Error("Email storage configuration missing");
    smtpOptions();
    return {
      enabled: mailEnabled(),
      secret: process.env.CRON_SECRET,
      siteUrl: productionSiteUrl(),
    };
  },
};

export function validCronAuthorization(
  header: string | undefined,
  secret: string,
) {
  if (!secret) return false;
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function clientIp(req: Request) {
  // Do not trust arbitrary forwarded headers during local development.
  const forwarded = process.env.VERCEL
    ? req.get("x-vercel-forwarded-for")
    : undefined;
  return (
    forwarded?.split(",")[0].trim() || req.socket.remoteAddress || "unknown"
  );
}
export function emailRouter(deps: Dependencies = defaults) {
  const router = Router();
  router.post("/subscribe", async (req, res) => {
    const body =
      req.body && typeof req.body === "object"
        ? {
            ...req.body,
            email:
              typeof req.body.email === "string"
                ? req.body.email.trim().toLowerCase()
                : req.body.email,
          }
        : req.body;
    const parsed = SubscribeBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_INPUT" });
      return;
    }
    if (parsed.data.website) {
      res.status(200).json({ registered: true });
      return;
    }
    let config: Settings;
    try {
      config = deps.settings();
    } catch {
      res.status(503).json({ error: "EMAIL_UNAVAILABLE" });
      return;
    }
    if (!config.enabled) {
      res.status(503).json({ error: "EMAIL_UNAVAILABLE" });
      return;
    }
    try {
      const store = deps.store();
      const saved = await store.subscribe(
        parsed.data.email.trim().toLowerCase(),
        parsed.data.lang,
        clientIp(req),
      );
      if (saved.created) {
        try {
          await deliverJobs({
            store,
            sender: deps.sender(),
            siteUrl: config.siteUrl,
            subscriberId: saved.subscriberId,
            limit: 2,
            budgetMs: 45000,
            reportError: (code) =>
              logger.warn({ code }, "Signup email queued for retry"),
          });
        } catch {
          logger.warn(
            "Signup saved; pending emails will be retried by the worker",
          );
        }
      }
      res
        .status(saved.created ? 201 : 200)
        .json({ registered: saved.registered });
    } catch (error) {
      if (error instanceof RateLimitError) {
        res.setHeader("Retry-After", "3600");
        res.status(429).json({ error: "RATE_LIMITED" });
      } else {
        logger.error("Subscription storage failed");
        res.status(503).json({ error: "EMAIL_UNAVAILABLE" });
      }
    }
  });

  router.post("/unsubscribe", async (req, res) => {
    const parsed = UnsubscribeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "INVALID_INPUT" });
      return;
    }
    if (!process.env.DATABASE_URL && deps === defaults) {
      res.status(503).json({ error: "EMAIL_UNAVAILABLE" });
      return;
    }
    try {
      const exists = await deps.store().unsubscribe(parsed.data.token);
      res
        .status(exists ? 200 : 400)
        .json(exists ? { unsubscribed: true } : { error: "INVALID_TOKEN" });
    } catch {
      res.status(503).json({ error: "EMAIL_UNAVAILABLE" });
    }
  });

  router.get("/cron/email-delivery", async (req, res) => {
    // Authenticate before checking SMTP or touching the database.
    const secret =
      deps === defaults
        ? (process.env.CRON_SECRET ?? "")
        : deps.settings().secret;
    if (!validCronAuthorization(req.get("authorization"), secret)) {
      res.status(401).json({ error: "UNAUTHORIZED" });
      return;
    }
    try {
      const config = deps.settings();
      if (!config.enabled) {
        res.json({ disabled: true, sent: 0, failed: 0, cancelled: 0 });
        return;
      }
      const stats = await runEmailCron(
        deps.store(),
        deps.sender(),
        config.siteUrl,
      );
      logger.info(stats, "Email worker completed");
      res.json(stats);
    } catch {
      logger.error("Email worker failed");
      res.status(503).json({ error: "EMAIL_UNAVAILABLE" });
    }
  });
  return router;
}

// Run with: node --import tsx scripts/smtp-check.mjs
// Credentials can come from the process environment or masked JSON stdin.
// Never print credentials, SMTP responses, or database URLs.
import { randomUUID } from "node:crypto";
import {
  createMailSender,
  buildMessage,
  productionSiteUrl,
} from "../src/lib/email-delivery.ts";

if (!process.env.SMTP_PASS) {
  if (!process.stdin.isTTY)
    throw new Error(
      "Set SMTP_USER/SMTP_PASS securely in the process environment",
    );
  process.stdin.setRawMode(true);
  process.stdout.write("READY_FOR_MASKED_CONFIGURATION\n");
  try {
    const input = await new Promise((resolve) => {
      let text = "";
      const onData = (chunk) => {
        text += chunk.toString();
        if (/[\r\n]/.test(text)) {
          process.stdin.off("data", onData);
          resolve(text.trim());
        }
      };
      process.stdin.on("data", onData);
      process.stdin.resume();
    });
    const config = JSON.parse(input);
    for (const key of ["SMTP_USER", "SMTP_PASS", "PUBLIC_SITE_URL"]) {
      if (typeof config[key] === "string") process.env[key] = config[key];
    }
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  console.log("Configuration received securely.");
}
const sender = createMailSender();
const hardTimeout = setTimeout(() => {
  console.error("SMTP_TEST_TIMEOUT");
  sender.close();
  process.exit(1);
}, 45000);
try {
  await sender.verify();
  console.log("SMTP authentication and STARTTLS verified.");
  const base = {
    subscriber_id: randomUUID(),
    email: "info@fikryon.com",
    lang: "ar",
    unsubscribe_token: "0".repeat(64),
    created_at: new Date(),
    unsubscribed_at: null,
    attempts: 1,
    lease_id: randomUUID(),
  };
  for (const kind of ["admin", "acknowledgement"]) {
    const message = buildMessage(
      { ...base, id: randomUUID(), kind },
      productionSiteUrl(),
    );
    message.subject = `[Configuration test] ${message.subject}`;
    message.text = `${message.text}\n\nThis is a controlled configuration test; the unsubscribe token is not active.`;
    const result = await sender.sendMail(message);
    if (!result.accepted?.includes("info@fikryon.com"))
      throw Object.assign(new Error("Rejected"), {
        code: "RECIPIENT_REJECTED",
      });
    console.log(`${kind}: accepted by SMTP server for info@fikryon.com`);
  }
} catch (error) {
  console.error(
    JSON.stringify({
      smtpTestFailed: true,
      code: error.code ?? "SMTP_FAILED",
      responseCode: error.responseCode,
    }),
  );
  process.exitCode = 1;
} finally {
  clearTimeout(hardTimeout);
  sender.close();
  delete process.env.SMTP_PASS;
}

import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const subscribers = pgTable("subscribers", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  lang: text("lang").notNull(),
  unsubscribeToken: text("unsubscribe_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
});

export const emailJobs = pgTable(
  "email_jobs",
  {
    id: uuid("id").primaryKey(),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => subscribers.id),
    kind: text("kind").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseId: uuid("lease_id"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (t) => [
    uniqueIndex("email_jobs_subscriber_kind").on(t.subscriberId, t.kind),
    index("email_jobs_pending").on(t.availableAt),
  ],
);

export const emailThrottle = pgTable("email_throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

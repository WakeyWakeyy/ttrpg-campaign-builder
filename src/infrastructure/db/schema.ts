import { sql } from "drizzle-orm";
import {
  date,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userAccount = pgTable("user_account", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .defaultNow()
    .notNull(),
});

export const authIdentity = pgTable(
  "auth_identity",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userAccount.id, {
        onDelete: "cascade",
      }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_identity_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
  ],
);

export const ruleset = pgTable(
  "ruleset",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("ruleset_key_unique").on(table.key)],
);

// Published versions have no application update path. Changes require a new version.
export const rulesetVersion = pgTable(
  "ruleset_version",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    rulesetId: uuid("ruleset_id")
      .notNull()
      .references(() => ruleset.id, { onDelete: "restrict" }),
    version: text("version").notNull(),
    name: text("name").notNull(),
    publishedAt: date("published_at"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ruleset_version_ruleset_version_unique").on(table.rulesetId, table.version),
    // A3 references this pair to reject mismatched Ruleset/Version pins.
    uniqueIndex("ruleset_version_ruleset_id_unique").on(table.rulesetId, table.id),
  ],
);

export const rulesetContentSource = pgTable(
  "ruleset_content_source",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    rulesetVersionId: uuid("ruleset_version_id")
      .notNull()
      .references(() => rulesetVersion.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    sourceUrl: text("source_url").notNull(),
    license: text("license").notNull(),
    licenseUrl: text("license_url").notNull(),
    attribution: text("attribution").notNull(),
    publishedAt: date("published_at"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("ruleset_content_source_version_key_unique").on(table.rulesetVersionId, table.key),
  ],
);

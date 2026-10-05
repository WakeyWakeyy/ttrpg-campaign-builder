import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
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

export const campaign = pgTable("campaign", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  ownerUserId: uuid("owner_user_id").notNull()
    .references(() => userAccount.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  purgeAfter: timestamp("purge_after", { withTimezone: true, mode: "date" }),
}, (table) => [
  // Explicit null checks prevent SQL's UNKNOWN result from bypassing the check.
  // UTC arithmetic makes retention independent of the connection's DST rules.
  check("campaign_trash_retention_check", sql`
    (${table.deletedAt} IS NULL AND ${table.purgeAfter} IS NULL) OR
    (${table.deletedAt} IS NOT NULL AND ${table.purgeAfter} IS NOT NULL
      AND isfinite(${table.deletedAt})
      AND ${table.purgeAfter} = ((${table.deletedAt} AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC')
  `),
]);

export const campaignRuleset = pgTable("campaign_ruleset", {
  campaignId: uuid("campaign_id").primaryKey()
    .references(() => campaign.id, { onDelete: "cascade" }),
  rulesetId: uuid("ruleset_id").notNull(),
  rulesetVersionId: uuid("ruleset_version_id").notNull(),
  pinnedAt: timestamp("pinned_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "campaign_ruleset_version_fk",
    columns: [table.rulesetId, table.rulesetVersionId],
    foreignColumns: [rulesetVersion.rulesetId, rulesetVersion.id],
  }).onDelete("restrict"),
]);

export const campaignCompass = pgTable("campaign_compass", {
  campaignId: uuid("campaign_id").primaryKey()
    .references(() => campaign.id, { onDelete: "cascade" }),
  originalPremise: text("original_premise").notNull(),
  currentPremise: text("current_premise").notNull(),
  setting: text("setting"),
  tone: text("tone"),
  originalNotes: text("original_notes"),
  revision: integer("revision").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [check("campaign_compass_revision_positive", sql`${table.revision} > 0`)]);

export const campaignCompassGuideline = pgTable("campaign_compass_guideline", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  sortOrder: integer("sort_order"),
}, (table) => [
  check("campaign_compass_guideline_kind_check", sql`${table.kind} IN ('theme', 'gm_priority', 'boundary', 'style', 'other')`),
]);

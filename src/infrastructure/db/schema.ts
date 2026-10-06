import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  integer,
  index,
  jsonb,
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

// A draft is owned by an internal user and has no Campaign identity until accepted.
export const blueprintDraft = pgTable("blueprint_draft", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => userAccount.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  premise: text("premise").notNull(),
  setting: text("setting"),
  tone: text("tone"),
  proposedLocations: jsonb("proposed_locations").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  reviewStartedAt: timestamp("review_started_at", { withTimezone: true, mode: "date" }),
  revision: integer("revision").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [
  index("blueprint_draft_owner_idx").on(table.ownerUserId),
  check("blueprint_draft_revision_positive", sql`${table.revision} > 0`),
  check("blueprint_draft_title_nonempty", sql`length(btrim(${table.title})) > 0`),
  check("blueprint_draft_premise_nonempty", sql`length(btrim(${table.premise})) > 0`),
  check("blueprint_draft_locations_array", sql`jsonb_typeof(${table.proposedLocations}) = 'array'`),
]);

export const blueprintProposal = pgTable("blueprint_proposal", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  blueprintId: uuid("blueprint_id").notNull().references(() => blueprintDraft.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  decision: text("decision").default("PENDING").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, table => [
  index("blueprint_proposal_blueprint_idx").on(table.blueprintId),
  uniqueIndex("blueprint_proposal_order_unique").on(table.blueprintId, table.sortOrder),
  check("blueprint_proposal_decision_check", sql`${table.decision} IN ('PENDING', 'ACCEPTED', 'REJECTED')`),
  check("blueprint_proposal_name_nonempty", sql`length(btrim(${table.name})) > 0`),
  check("blueprint_proposal_order_positive", sql`${table.sortOrder} > 0`),
]);

export const blueprintMaterialization = pgTable("blueprint_materialization", {
  blueprintId: uuid("blueprint_id").primaryKey().references(() => blueprintDraft.id, { onDelete: "restrict" }),
  campaignId: uuid("campaign_id").notNull().unique().references(() => campaign.id, { onDelete: "restrict" }),
  reviewedRevision: integer("reviewed_revision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [check("blueprint_materialization_revision_positive", sql`${table.reviewedRevision} > 0`)]);

export const campaignEntity = pgTable("campaign_entity", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull()
    .references(() => campaign.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  revision: integer("revision").default(1).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull()
    .references(() => userAccount.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  purgeAfter: timestamp("purge_after", { withTimezone: true, mode: "date" }),
}, (table) => [
  uniqueIndex("campaign_entity_campaign_id_id_unique").on(table.campaignId, table.id),
  // A4 has exactly one supported subtype. Extend this check with future subtypes.
  check("campaign_entity_type_check", sql`${table.entityType} = 'LOCATION'`),
  check("campaign_entity_revision_positive", sql`${table.revision} > 0`),
  check("campaign_entity_trash_retention_check", sql`
    (${table.deletedAt} IS NULL AND ${table.purgeAfter} IS NULL) OR
    (${table.deletedAt} IS NOT NULL AND ${table.purgeAfter} IS NOT NULL
      AND isfinite(${table.deletedAt})
      AND ${table.purgeAfter} = ((${table.deletedAt} AT TIME ZONE 'UTC') + interval '30 days') AT TIME ZONE 'UTC')
  `),
]);

export const location = pgTable("location", {
  // Identity comes from the registry, never a second generated ID.
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  parentLocationId: uuid("parent_location_id"),
}, (table) => [
  uniqueIndex("location_campaign_id_id_unique").on(table.campaignId, table.id),
  index("location_campaign_parent_idx").on(table.campaignId, table.parentLocationId),
  foreignKey({
    name: "location_campaign_entity_fk",
    columns: [table.campaignId, table.id],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "location_parent_same_campaign_fk",
    columns: [table.campaignId, table.parentLocationId],
    foreignColumns: [table.campaignId, table.id],
  }).onDelete("no action"),
  // Longer cycles are validated by the application, not recursive DB triggers.
  check("location_parent_not_self", sql`${table.parentLocationId} <> ${table.id}`),
]);

// Important retryable commands only; fingerprint comparison belongs to application logic.
export const commandExecution = pgTable("command_execution", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  scopeUserId: uuid("scope_user_id").notNull().references(() => userAccount.id, { onDelete: "restrict" }),
  scopeCampaignId: uuid("scope_campaign_id").references(() => campaign.id, { onDelete: "cascade" }),
  commandKind: text("command_kind").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  status: text("status").notNull(),
  resultSchemaVersion: integer("result_schema_version"),
  resultJson: jsonb("result_json"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
}, (table) => [
  uniqueIndex("command_execution_user_idempotency_unique")
    .on(table.scopeUserId, table.commandKind, table.idempotencyKey).where(sql`${table.scopeCampaignId} IS NULL`),
  uniqueIndex("command_execution_campaign_idempotency_unique")
    .on(table.scopeUserId, table.scopeCampaignId, table.commandKind, table.idempotencyKey).where(sql`${table.scopeCampaignId} IS NOT NULL`),
  check("command_execution_status_check", sql`${table.status} IN ('IN_PROGRESS', 'SUCCEEDED')`),
  check("command_execution_command_kind_nonempty", sql`length(btrim(${table.commandKind})) > 0`),
  check("command_execution_idempotency_key_nonempty", sql`length(btrim(${table.idempotencyKey})) > 0`),
  check("command_execution_request_fingerprint_nonempty", sql`length(btrim(${table.requestFingerprint})) > 0`),
  check("command_execution_result_schema_version_positive", sql`${table.resultSchemaVersion} > 0`),
  check("command_execution_completion_check", sql`
    (${table.status} = 'IN_PROGRESS' AND ${table.completedAt} IS NULL) OR
    (${table.status} = 'SUCCEEDED' AND ${table.completedAt} IS NOT NULL)`),
]);

export const changeSet = pgTable("change_set", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaign.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => userAccount.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  revertedAt: timestamp("reverted_at", { withTimezone: true, mode: "date" }),
  revertedByUserId: uuid("reverted_by_user_id").references(() => userAccount.id, { onDelete: "restrict" }),
}, (table) => [
  check("change_set_kind_nonempty", sql`length(btrim(${table.kind})) > 0`),
  check("change_set_reverted_pair_check", sql`(${table.revertedAt} IS NULL) = (${table.revertedByUserId} IS NULL)`),
]);

// Versioned selective undo payloads deliberately do not reference live domain rows.
export const changeSetEntry = pgTable("change_set_entry", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  changeSetId: uuid("change_set_id").notNull().references(() => changeSet.id, { onDelete: "cascade" }),
  entityId: uuid("entity_id"),
  objectKind: text("object_kind").notNull(),
  objectId: uuid("object_id"),
  operation: text("operation").notNull(),
  snapshotSchemaVersion: integer("snapshot_schema_version").default(1).notNull(),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  expectedCurrentRevision: integer("expected_current_revision"),
  applyOrder: integer("apply_order").notNull(),
}, (table) => [
  uniqueIndex("change_set_entry_apply_order_unique").on(table.changeSetId, table.applyOrder),
  check("change_set_entry_object_kind_nonempty", sql`length(btrim(${table.objectKind})) > 0`),
  check("change_set_entry_object_identity_check", sql`${table.entityId} IS NOT NULL OR ${table.objectId} IS NOT NULL`),
  check("change_set_entry_snapshot_schema_version_positive", sql`${table.snapshotSchemaVersion} > 0`),
  check("change_set_entry_expected_current_revision_positive", sql`${table.expectedCurrentRevision} > 0`),
  check("change_set_entry_apply_order_positive", sql`${table.applyOrder} > 0`),
  check("change_set_entry_before_object_check", sql`jsonb_typeof(${table.beforeJson}) = 'object'`),
  check("change_set_entry_after_object_check", sql`jsonb_typeof(${table.afterJson}) = 'object'`),
  check("change_set_entry_operation_snapshot_check", sql`
    (${table.operation} = 'INSERT' AND ${table.beforeJson} IS NULL AND ${table.afterJson} IS NOT NULL) OR
    (${table.operation} = 'UPDATE' AND ${table.beforeJson} IS NOT NULL AND ${table.afterJson} IS NOT NULL) OR
    (${table.operation} = 'DELETE' AND ${table.beforeJson} IS NOT NULL AND ${table.afterJson} IS NULL)`),
]);

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  integer,
  index,
  jsonb,
  pgTable,
  primaryKey,
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

// Reference entries belong to one published source, and never to Campaign Core.
export const rulesetReference = pgTable(
  "ruleset_reference",
  {
    id: uuid("id").default(sql`uuidv7()`).primaryKey(),
    sourceId: uuid("source_id").notNull()
      .references(() => rulesetContentSource.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    page: integer("page").notNull(),
  },
  (table) => [
    uniqueIndex("ruleset_reference_source_key_unique").on(table.sourceId, table.key),
    check("ruleset_reference_page_positive", sql`${table.page} > 0`),
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
  uniqueIndex("campaign_entity_campaign_id_id_type_unique").on(table.campaignId, table.id, table.entityType),
  check("campaign_entity_type_check", sql`${table.entityType} IN ('LOCATION', 'ARC', 'QUEST', 'NPC', 'PLAYER_CHARACTER', 'PARTY', 'FACTION', 'TRAVEL_ROUTE', 'ITEM', 'RELATIONSHIP', 'TIMELINE_EVENT', 'SESSION', 'ENCOUNTER', 'REWARD', 'CLUE', 'SECRET')`),
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
  entityType: text("entity_type").default("LOCATION").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  parentLocationId: uuid("parent_location_id"),
}, (table) => [
  uniqueIndex("location_campaign_id_id_unique").on(table.campaignId, table.id),
  index("location_campaign_parent_idx").on(table.campaignId, table.parentLocationId),
  foreignKey({
    name: "location_campaign_entity_fk",
    columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType],
  }).onDelete("cascade"),
  foreignKey({
    name: "location_parent_same_campaign_fk",
    columns: [table.campaignId, table.parentLocationId],
    foreignColumns: [table.campaignId, table.id],
  }).onDelete("no action"),
  // Longer cycles are validated by the application, not recursive DB triggers.
  check("location_parent_not_self", sql`${table.parentLocationId} <> ${table.id}`),
  check("location_entity_type_check", sql`${table.entityType} = 'LOCATION'`),
]);

export const travelRoute = pgTable("travel_route", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("TRAVEL_ROUTE").notNull(),
  name: text("name").notNull(),
  fromLocationId: uuid("from_location_id").notNull(),
  toLocationId: uuid("to_location_id").notNull(),
  distance: text("distance"),
  duration: text("duration"),
  mode: text("mode"),
  hazards: text("hazards"),
  notes: text("notes"),
}, table => [
  uniqueIndex("travel_route_campaign_id_id_unique").on(table.campaignId, table.id),
  index("travel_route_campaign_idx").on(table.campaignId),
  foreignKey({ name: "travel_route_campaign_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  foreignKey({ name: "travel_route_from_location_fk", columns: [table.campaignId, table.fromLocationId],
    foreignColumns: [location.campaignId, location.id] }).onDelete("no action"),
  foreignKey({ name: "travel_route_to_location_fk", columns: [table.campaignId, table.toLocationId],
    foreignColumns: [location.campaignId, location.id] }).onDelete("no action"),
  check("travel_route_entity_type_check", sql`${table.entityType} = 'TRAVEL_ROUTE'`),
  check("travel_route_name_nonempty", sql`length(btrim(${table.name})) > 0`),
  check("travel_route_distinct_locations", sql`${table.fromLocationId} <> ${table.toLocationId}`),
]);

export const reward = pgTable("reward", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("REWARD").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
}, table => [
  uniqueIndex("reward_campaign_id_id_unique").on(table.campaignId, table.id),
  index("reward_campaign_idx").on(table.campaignId),
  foreignKey({ name: "reward_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("reward_entity_type_check", sql`${table.entityType} = 'REWARD'`),
  check("reward_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

export const rewardComponent = pgTable("reward_component", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  rewardId: uuid("reward_id").notNull(),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, table => [
  index("reward_component_reward_idx").on(table.rewardId),
  foreignKey({ name: "reward_component_reward_fk", columns: [table.campaignId, table.rewardId],
    foreignColumns: [reward.campaignId, reward.id] }).onDelete("cascade"),
  check("reward_component_kind_check", sql`${table.kind} IN ('MONEY', 'ITEM', 'INFORMATION', 'REPUTATION', 'FAVOR', 'ACCESS', 'PROGRESSION', 'OTHER')`),
  check("reward_component_description_nonempty", sql`length(btrim(${table.description})) > 0`),
]);

// Grants are historical records. Source links may disappear while the awarded snapshot remains.
export const rewardGrant = pgTable("reward_grant", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  requestKey: uuid("request_key").notNull(),
  requestHash: text("request_hash").notNull(),
  sourceCampaignId: uuid("source_campaign_id"),
  rewardId: uuid("reward_id"),
  sessionCampaignId: uuid("session_campaign_id"),
  sessionId: uuid("session_id"),
  rewardTitle: text("reward_title").notNull(),
  recipient: text("recipient").notNull(),
  notes: text("notes"),
  grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [
  uniqueIndex("reward_grant_request_unique").on(table.campaignId, table.requestKey),
  index("reward_grant_campaign_time_idx").on(table.campaignId, table.grantedAt),
  foreignKey({ name: "reward_grant_campaign_fk", columns: [table.campaignId],
    foreignColumns: [campaign.id] }).onDelete("cascade"),
  foreignKey({ name: "reward_grant_source_fk", columns: [table.sourceCampaignId, table.rewardId],
    foreignColumns: [reward.campaignId, reward.id] }).onDelete("set null"),
  foreignKey({ name: "reward_grant_session_fk", columns: [table.sessionCampaignId, table.sessionId],
    foreignColumns: [session.campaignId, session.id] }).onDelete("set null"),
  check("reward_grant_source_scope", sql`(${table.rewardId} IS NULL AND ${table.sourceCampaignId} IS NULL)
    OR (${table.rewardId} IS NOT NULL AND ${table.sourceCampaignId} IS NOT NULL
      AND ${table.sourceCampaignId} = ${table.campaignId})`),
  check("reward_grant_session_scope", sql`(${table.sessionId} IS NULL AND ${table.sessionCampaignId} IS NULL)
    OR (${table.sessionId} IS NOT NULL AND ${table.sessionCampaignId} IS NOT NULL
      AND ${table.sessionCampaignId} = ${table.campaignId})`),
  check("reward_grant_recipient_nonempty", sql`length(btrim(${table.recipient})) > 0`),
  check("reward_grant_title_nonempty", sql`length(btrim(${table.rewardTitle})) > 0`),
]);

export const rewardGrantComponent = pgTable("reward_grant_component", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  grantId: uuid("grant_id").notNull(),
  kind: text("kind").notNull(),
  description: text("description").notNull(),
}, table => [
  index("reward_grant_component_grant_idx").on(table.grantId),
  foreignKey({ name: "reward_grant_component_grant_fk", columns: [table.grantId],
    foreignColumns: [rewardGrant.id] }).onDelete("cascade"),
  check("reward_grant_component_kind_check", sql`${table.kind} IN ('MONEY', 'ITEM', 'INFORMATION', 'REPUTATION', 'FAVOR', 'ACCESS', 'PROGRESSION', 'OTHER')`),
  check("reward_grant_component_description_nonempty", sql`length(btrim(${table.description})) > 0`),
]);

export const encounter = pgTable("encounter", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("ENCOUNTER").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
}, table => [
  uniqueIndex("encounter_campaign_id_id_unique").on(table.campaignId, table.id),
  index("encounter_campaign_idx").on(table.campaignId),
  foreignKey({ name: "encounter_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("encounter_entity_type_check", sql`${table.entityType} = 'ENCOUNTER'`),
  check("encounter_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

// Ruleset-specific preparation remains outside the ruleset-neutral Encounter identity.
export const encounterSrdPlan = pgTable("encounter_srd_521_plan", {
  encounterId: uuid("encounter_id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  partyLevel: integer("party_level").notNull(),
  partySize: integer("party_size").notNull(),
}, table => [
  foreignKey({ name: "encounter_srd_plan_encounter_fk", columns: [table.campaignId, table.encounterId],
    foreignColumns: [encounter.campaignId, encounter.id] }).onDelete("cascade"),
  check("encounter_srd_plan_level_check", sql`${table.partyLevel} BETWEEN 1 AND 20`),
  check("encounter_srd_plan_size_check", sql`${table.partySize} BETWEEN 1 AND 20`),
]);

export const encounterCreature = pgTable("encounter_srd_521_creature", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  encounterId: uuid("encounter_id").notNull(),
  name: text("name").notNull(),
  xp: integer("xp").notNull(),
  quantity: integer("quantity").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, table => [
  index("encounter_creature_encounter_idx").on(table.encounterId),
  foreignKey({ name: "encounter_creature_encounter_fk", columns: [table.campaignId, table.encounterId],
    foreignColumns: [encounter.campaignId, encounter.id] }).onDelete("cascade"),
  check("encounter_creature_name_nonempty", sql`length(btrim(${table.name})) > 0`),
  check("encounter_creature_xp_nonnegative", sql`${table.xp} >= 0`),
  check("encounter_creature_quantity_positive", sql`${table.quantity} BETWEEN 1 AND 100`),
]);

export const session = pgTable("session", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("SESSION").notNull(),
  title: text("title").notNull(),
  plannedFor: date("planned_for"),
  preparation: text("preparation"),
  outcome: text("outcome"),
  attendanceSet: boolean("attendance_set").default(false).notNull(),
}, table => [
  uniqueIndex("session_campaign_id_id_unique").on(table.campaignId, table.id),
  index("session_campaign_planned_for_idx").on(table.campaignId, table.plannedFor),
  foreignKey({ name: "session_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("session_entity_type_check", sql`${table.entityType} = 'SESSION'`),
  check("session_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

export const scene = pgTable("scene", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  preparation: text("preparation"),
  outcome: text("outcome"),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
}, table => [
  uniqueIndex("scene_campaign_session_id_unique").on(table.campaignId, table.sessionId, table.id),
  index("scene_session_position_idx").on(table.sessionId, table.position),
  foreignKey({ name: "scene_session_fk", columns: [table.campaignId, table.sessionId],
    foreignColumns: [session.campaignId, session.id] }).onDelete("cascade"),
  check("scene_position_positive", sql`${table.position} > 0`),
  check("scene_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

export const encounterPlacement = pgTable("encounter_placement", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  sceneId: uuid("scene_id"),
  encounterId: uuid("encounter_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [
  index("encounter_placement_session_idx").on(table.sessionId),
  index("encounter_placement_encounter_idx").on(table.encounterId),
  uniqueIndex("encounter_placement_run_source_unique").on(table.campaignId, table.sessionId,
    table.id, table.encounterId),
  foreignKey({ name: "encounter_placement_session_fk", columns: [table.campaignId, table.sessionId],
    foreignColumns: [session.campaignId, session.id] }).onDelete("cascade"),
  foreignKey({ name: "encounter_placement_scene_fk", columns: [table.campaignId, table.sessionId, table.sceneId],
    foreignColumns: [scene.campaignId, scene.sessionId, scene.id] }).onDelete("cascade"),
  foreignKey({ name: "encounter_placement_encounter_fk", columns: [table.campaignId, table.encounterId],
    foreignColumns: [encounter.campaignId, encounter.id] }).onDelete("cascade"),
]);

// A run records what happened at the table. The optional source links may disappear;
// title and creature rows remain an independent snapshot of that play history.
export const encounterRun = pgTable("encounter_run", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  sourceCampaignId: uuid("source_campaign_id"),
  sourceSessionId: uuid("source_session_id"),
  placementId: uuid("placement_id"),
  encounterId: uuid("encounter_id"),
  title: text("title").notNull(),
  outcome: text("outcome").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [
  index("encounter_run_session_idx").on(table.sessionId, table.occurredAt),
  foreignKey({ name: "encounter_run_session_fk", columns: [table.campaignId, table.sessionId],
    foreignColumns: [session.campaignId, session.id] }).onDelete("cascade"),
  foreignKey({ name: "encounter_run_source_fk", columns: [table.sourceCampaignId, table.sourceSessionId,
    table.placementId, table.encounterId], foreignColumns: [encounterPlacement.campaignId,
    encounterPlacement.sessionId, encounterPlacement.id, encounterPlacement.encounterId] }).onDelete("set null"),
  check("encounter_run_source_scope", sql`(
    (${table.sourceCampaignId} IS NULL AND ${table.sourceSessionId} IS NULL
      AND ${table.placementId} IS NULL AND ${table.encounterId} IS NULL)
    OR (${table.sourceCampaignId} = ${table.campaignId} AND ${table.sourceSessionId} = ${table.sessionId}
      AND ${table.placementId} IS NOT NULL AND ${table.encounterId} IS NOT NULL)
  )`),
  check("encounter_run_title_nonempty", sql`length(btrim(${table.title})) > 0`),
  check("encounter_run_outcome_nonempty", sql`length(btrim(${table.outcome})) > 0`),
]);

export const encounterRunCreature = pgTable("encounter_run_creature", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  runId: uuid("run_id").notNull(),
  name: text("name").notNull(),
  xp: integer("xp").notNull(),
  quantity: integer("quantity").notNull(),
}, table => [
  index("encounter_run_creature_run_idx").on(table.runId),
  foreignKey({ name: "encounter_run_creature_run_fk", columns: [table.runId],
    foreignColumns: [encounterRun.id] }).onDelete("cascade"),
  check("encounter_run_creature_name_nonempty", sql`length(btrim(${table.name})) > 0`),
  check("encounter_run_creature_xp_nonnegative", sql`${table.xp} >= 0`),
  check("encounter_run_creature_quantity_positive", sql`${table.quantity} > 0`),
]);

export const arc = pgTable("arc", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("ARC").notNull(),
  name: text("name").notNull(),
  description: text("description"),
}, table => [
  uniqueIndex("arc_campaign_id_id_unique").on(table.campaignId, table.id),
  index("arc_campaign_idx").on(table.campaignId),
  foreignKey({
    name: "arc_campaign_entity_fk",
    columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType],
  }).onDelete("cascade"),
  check("arc_entity_type_check", sql`${table.entityType} = 'ARC'`),
  check("arc_name_nonempty", sql`length(btrim(${table.name})) > 0`),
]);

export const npc = pgTable("npc", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("NPC").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  role: text("role"),
  currentState: text("current_state"),
}, table => [
  uniqueIndex("npc_campaign_id_id_unique").on(table.campaignId, table.id),
  index("npc_campaign_idx").on(table.campaignId),
  foreignKey({ name: "npc_campaign_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("npc_entity_type_check", sql`${table.entityType} = 'NPC'`),
  check("npc_name_nonempty", sql`length(btrim(${table.name})) > 0`),
]);

export const playerCharacter = pgTable("player_character", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("PLAYER_CHARACTER").notNull(),
  name: text("name").notNull(),
  playerName: text("player_name"),
  description: text("description"),
  currentState: text("current_state"),
}, table => [
  uniqueIndex("player_character_campaign_id_id_unique").on(table.campaignId, table.id),
  index("player_character_campaign_idx").on(table.campaignId),
  foreignKey({ name: "player_character_campaign_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("player_character_entity_type_check", sql`${table.entityType} = 'PLAYER_CHARACTER'`),
  check("player_character_name_nonempty", sql`length(btrim(${table.name})) > 0`),
]);

export const party = pgTable("party", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("PARTY").notNull(),
  name: text("name").notNull(),
  description: text("description"),
}, table => [
  uniqueIndex("party_campaign_id_id_unique").on(table.campaignId, table.id),
  index("party_campaign_idx").on(table.campaignId),
  foreignKey({ name: "party_campaign_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("party_entity_type_check", sql`${table.entityType} = 'PARTY'`),
  check("party_name_nonempty", sql`length(btrim(${table.name})) > 0`),
]);

export const partyMember = pgTable("party_member", {
  campaignId: uuid("campaign_id").notNull(),
  partyId: uuid("party_id").notNull(),
  playerCharacterId: uuid("player_character_id").notNull(),
}, table => [
  primaryKey({ columns: [table.partyId, table.playerCharacterId] }),
  foreignKey({ name: "party_member_party_fk", columns: [table.campaignId, table.partyId],
    foreignColumns: [party.campaignId, party.id] }).onDelete("cascade"),
  foreignKey({ name: "party_member_player_character_fk", columns: [table.campaignId, table.playerCharacterId],
    foreignColumns: [playerCharacter.campaignId, playerCharacter.id] }).onDelete("cascade"),
]);

export const sessionAttendance = pgTable("session_attendance", {
  campaignId: uuid("campaign_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  playerCharacterId: uuid("player_character_id").notNull(),
}, table => [
  primaryKey({ columns: [table.sessionId, table.playerCharacterId] }),
  foreignKey({ name: "session_attendance_session_fk", columns: [table.campaignId, table.sessionId],
    foreignColumns: [session.campaignId, session.id] }).onDelete("cascade"),
  foreignKey({ name: "session_attendance_player_character_fk", columns: [table.campaignId, table.playerCharacterId],
    foreignColumns: [playerCharacter.campaignId, playerCharacter.id] }).onDelete("cascade"),
]);

export const faction = pgTable("faction", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("FACTION").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  purpose: text("purpose"),
  currentState: text("current_state"),
}, table => [
  uniqueIndex("faction_campaign_id_id_unique").on(table.campaignId, table.id),
  index("faction_campaign_idx").on(table.campaignId),
  foreignKey({ name: "faction_campaign_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("faction_entity_type_check", sql`${table.entityType} = 'FACTION'`),
  check("faction_name_nonempty", sql`length(btrim(${table.name})) > 0`),
]);

export const factionMembership = pgTable("faction_membership", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  factionId: uuid("faction_id").notNull(),
  npcId: uuid("npc_id"),
  playerCharacterId: uuid("player_character_id"),
  role: text("role"),
  rank: text("rank"),
  status: text("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, table => [
  index("faction_membership_faction_idx").on(table.factionId),
  uniqueIndex("faction_membership_npc_unique").on(table.factionId, table.npcId),
  uniqueIndex("faction_membership_pc_unique").on(table.factionId, table.playerCharacterId),
  foreignKey({ name: "faction_membership_faction_fk", columns: [table.campaignId, table.factionId],
    foreignColumns: [faction.campaignId, faction.id] }).onDelete("cascade"),
  foreignKey({ name: "faction_membership_npc_fk", columns: [table.campaignId, table.npcId],
    foreignColumns: [npc.campaignId, npc.id] }).onDelete("cascade"),
  foreignKey({ name: "faction_membership_pc_fk", columns: [table.campaignId, table.playerCharacterId],
    foreignColumns: [playerCharacter.campaignId, playerCharacter.id] }).onDelete("cascade"),
  check("faction_membership_one_member", sql`(${table.npcId} IS NULL) <> (${table.playerCharacterId} IS NULL)`),
  check("faction_membership_status_check", sql`${table.status} IN ('ACTIVE', 'FORMER')`),
]);

export const quest = pgTable("quest", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("QUEST").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").default("OPEN").notNull(),
  parentQuestId: uuid("parent_quest_id"),
}, table => [
  uniqueIndex("quest_campaign_id_id_unique").on(table.campaignId, table.id),
  index("quest_campaign_parent_idx").on(table.campaignId, table.parentQuestId),
  foreignKey({ name: "quest_campaign_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  foreignKey({ name: "quest_parent_same_campaign_fk", columns: [table.campaignId, table.parentQuestId],
    foreignColumns: [table.campaignId, table.id] }).onDelete("no action"),
  check("quest_entity_type_check", sql`${table.entityType} = 'QUEST'`),
  check("quest_name_nonempty", sql`length(btrim(${table.name})) > 0`),
  check("quest_parent_not_self", sql`${table.parentQuestId} <> ${table.id}`),
  check("quest_status_check", sql`${table.status} IN ('OPEN', 'RESOLVED', 'FAILED', 'POSTPONED', 'ABANDONED')`),
]);

export const arcQuest = pgTable("arc_quest", {
  campaignId: uuid("campaign_id").notNull(),
  arcId: uuid("arc_id").notNull(),
  questId: uuid("quest_id").notNull(),
}, table => [
  primaryKey({ columns: [table.arcId, table.questId] }),
  foreignKey({ name: "arc_quest_arc_fk", columns: [table.campaignId, table.arcId],
    foreignColumns: [arc.campaignId, arc.id] }).onDelete("cascade"),
  foreignKey({ name: "arc_quest_quest_fk", columns: [table.campaignId, table.questId],
    foreignColumns: [quest.campaignId, quest.id] }).onDelete("cascade"),
]);

// Important retryable commands only; fingerprint comparison belongs to application logic.
export const timelineEvent = pgTable("timeline_event", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("TIMELINE_EVENT").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }),
  inWorldDate: text("in_world_date"),
}, table => [
  uniqueIndex("timeline_event_campaign_id_id_unique").on(table.campaignId, table.id),
  index("timeline_event_occurred_at_idx").on(table.campaignId, table.occurredAt),
  foreignKey({ name: "timeline_event_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("timeline_event_entity_type_check", sql`${table.entityType} = 'TIMELINE_EVENT'`),
  check("timeline_event_title_nonempty", sql`length(btrim(${table.title})) > 0`),
]);

export const timelineEventLink = pgTable("timeline_event_link", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  eventId: uuid("event_id").notNull(),
  targetCampaignId: uuid("target_campaign_id"),
  targetEntityId: uuid("target_entity_id"),
  targetTypeSnapshot: text("target_type_snapshot").notNull(),
  targetNameSnapshot: text("target_name_snapshot").notNull(),
}, table => [
  index("timeline_event_link_target_idx").on(table.targetCampaignId, table.targetEntityId),
  foreignKey({ name: "timeline_event_link_event_fk", columns: [table.campaignId, table.eventId],
    foreignColumns: [timelineEvent.campaignId, timelineEvent.id] }).onDelete("cascade"),
  foreignKey({ name: "timeline_event_link_target_fk", columns: [table.targetCampaignId, table.targetEntityId],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id] }).onDelete("set null"),
  check("timeline_event_link_campaign_check", sql`(${table.targetCampaignId} IS NULL AND ${table.targetEntityId} IS NULL) OR (${table.targetCampaignId} = ${table.campaignId} AND ${table.targetEntityId} IS NOT NULL)`),
  check("timeline_event_link_type_nonempty", sql`length(btrim(${table.targetTypeSnapshot})) > 0`),
  check("timeline_event_link_name_nonempty", sql`length(btrim(${table.targetNameSnapshot})) > 0`),
]);

export const semanticRelationship = pgTable("semantic_relationship", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("RELATIONSHIP").notNull(),
  sourceEntityId: uuid("source_entity_id").notNull(),
  targetEntityId: uuid("target_entity_id").notNull(),
  kind: text("kind").notNull(),
  description: text("description"),
}, table => [
  uniqueIndex("semantic_relationship_campaign_id_id_unique").on(table.campaignId, table.id),
  index("semantic_relationship_source_idx").on(table.campaignId, table.sourceEntityId),
  index("semantic_relationship_target_idx").on(table.campaignId, table.targetEntityId),
  foreignKey({ name: "semantic_relationship_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  foreignKey({ name: "semantic_relationship_source_fk", columns: [table.campaignId, table.sourceEntityId],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id] }).onDelete("no action"),
  foreignKey({ name: "semantic_relationship_target_fk", columns: [table.campaignId, table.targetEntityId],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id] }).onDelete("no action"),
  check("semantic_relationship_entity_type_check", sql`${table.entityType} = 'RELATIONSHIP'`),
  check("semantic_relationship_kind_nonempty", sql`length(btrim(${table.kind})) > 0`),
  check("semantic_relationship_distinct_endpoints", sql`${table.sourceEntityId} <> ${table.targetEntityId}`),
]);

export const item = pgTable("item", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("ITEM").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  significance: text("significance"),
  currentState: text("current_state"),
  notes: text("notes"),
  locationId: uuid("location_id"),
  npcHolderId: uuid("npc_holder_id"),
  playerCharacterHolderId: uuid("player_character_holder_id"),
}, table => [
  uniqueIndex("item_campaign_id_id_unique").on(table.campaignId, table.id),
  index("item_campaign_idx").on(table.campaignId),
  foreignKey({ name: "item_campaign_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  foreignKey({ name: "item_location_fk", columns: [table.campaignId, table.locationId],
    foreignColumns: [location.campaignId, location.id] }).onDelete("no action"),
  foreignKey({ name: "item_npc_holder_fk", columns: [table.campaignId, table.npcHolderId],
    foreignColumns: [npc.campaignId, npc.id] }).onDelete("no action"),
  foreignKey({ name: "item_pc_holder_fk", columns: [table.campaignId, table.playerCharacterHolderId],
    foreignColumns: [playerCharacter.campaignId, playerCharacter.id] }).onDelete("no action"),
  check("item_entity_type_check", sql`${table.entityType} = 'ITEM'`),
  check("item_name_nonempty", sql`length(btrim(${table.name})) > 0`),
  check("item_one_locator", sql`num_nonnulls(${table.locationId}, ${table.npcHolderId}, ${table.playerCharacterHolderId}) <= 1`),
]);

// Hidden campaign truth remains GM-authored and separate from any discovery route.
export const secret = pgTable("secret", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("SECRET").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
}, table => [
  uniqueIndex("secret_campaign_id_id_unique").on(table.campaignId, table.id),
  index("secret_campaign_idx").on(table.campaignId),
  foreignKey({ name: "secret_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("secret_entity_type_check", sql`${table.entityType} = 'SECRET'`),
  check("secret_title_nonempty", sql`length(btrim(${table.title})) > 0`),
  check("secret_content_nonempty", sql`length(btrim(${table.content})) > 0`),
]);

// Current GM-recorded understanding of a Secret. A missing row means no state was recorded.
export const secretKnowledge = pgTable("secret_knowledge", {
  id: uuid("id").default(sql`uuidv7()`).primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  secretId: uuid("secret_id").notNull(),
  holderId: uuid("holder_id").notNull(),
  holderType: text("holder_type").notNull(),
  state: text("state").notNull(),
  notes: text("notes"),
}, table => [
  uniqueIndex("secret_knowledge_holder_unique").on(table.secretId, table.holderId),
  index("secret_knowledge_campaign_idx").on(table.campaignId),
  foreignKey({ name: "secret_knowledge_secret_fk", columns: [table.campaignId, table.secretId],
    foreignColumns: [secret.campaignId, secret.id] }).onDelete("cascade"),
  foreignKey({ name: "secret_knowledge_holder_fk", columns: [table.campaignId, table.holderId, table.holderType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  check("secret_knowledge_holder_type_check", sql`${table.holderType} IN ('PLAYER_CHARACTER', 'NPC', 'PARTY', 'FACTION')`),
  check("secret_knowledge_state_check", sql`${table.state} IN ('SUSPECTED', 'PARTIAL', 'KNOWN')`),
]);

// A clue is campaign truth; the discovery location is a planned route to it, not proof a PC knows it.
export const clue = pgTable("clue", {
  id: uuid("id").primaryKey(),
  campaignId: uuid("campaign_id").notNull(),
  entityType: text("entity_type").default("CLUE").notNull(),
  title: text("title").notNull(),
  secret: text("secret").notNull(),
  secretId: uuid("secret_id"),
  discoveryLocationId: uuid("discovery_location_id"),
}, table => [
  uniqueIndex("clue_campaign_id_id_unique").on(table.campaignId, table.id),
  index("clue_campaign_idx").on(table.campaignId),
  foreignKey({ name: "clue_entity_fk", columns: [table.campaignId, table.id, table.entityType],
    foreignColumns: [campaignEntity.campaignId, campaignEntity.id, campaignEntity.entityType] }).onDelete("cascade"),
  foreignKey({ name: "clue_discovery_location_fk", columns: [table.campaignId, table.discoveryLocationId],
    foreignColumns: [location.campaignId, location.id] }).onDelete("no action"),
  foreignKey({ name: "clue_secret_fk", columns: [table.campaignId, table.secretId],
    foreignColumns: [secret.campaignId, secret.id] }).onDelete("no action"),
  check("clue_entity_type_check", sql`${table.entityType} = 'CLUE'`),
  check("clue_title_nonempty", sql`length(btrim(${table.title})) > 0`),
  check("clue_secret_nonempty", sql`length(btrim(${table.secret})) > 0`),
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

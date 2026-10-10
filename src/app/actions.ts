"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { createCampaign, editCompass, RulesetVersionNotFoundError } from "@/modules/campaigns";
import { createBlueprint, decideBlueprintProposal, editBlueprint, materializeBlueprint, startBlueprintReview } from "@/modules/blueprints";
import { archiveLocation, createLocation, editLocation, restoreLocation, trashLocation } from "@/modules/locations";
import { archiveTravelRoute, createTravelRoute, editTravelRoute, restoreTravelRoute, trashTravelRoute } from "@/modules/travel-routes";
import { archiveItem, createItem, editItem, restoreItem, trashItem } from "@/modules/items";
import { archiveRelationship, createRelationship, editRelationship, restoreRelationship, trashRelationship } from "@/modules/relationships";
import { archiveTimelineEvent, createTimelineEvent, editTimelineEvent, restoreTimelineEvent, trashTimelineEvent } from "@/modules/timeline";
import { archiveSession, createScene, createSession, editScene, editSession, recordSceneOutcome, recordSessionOutcome, restoreSession, reuseSessionPreparation, setSessionAttendance, trashSession } from "@/modules/sessions";
import { addEncounterCreature, archiveEncounter, createEncounter, editEncounter, editEncounterCreature, placeEncounter, recordEncounterRun, removeEncounterPlacement, restoreEncounter, trashEncounter } from "@/modules/encounters";
import { addRewardComponent, archiveReward, createReward, editReward, editRewardComponent, restoreReward, trashReward, type RewardKind } from "@/modules/rewards";
import { recordRewardGrant } from "@/modules/rewards/grants";
import { archiveClue, createClue, editClue, restoreClue, trashClue, unarchiveClue } from "@/modules/knowledge";
import { archiveArc, createArc, editArc, restoreArc, trashArc } from "@/modules/arcs";
import { archiveQuest, createQuest, editQuest, restoreQuest, trashQuest, type QuestStatus } from "@/modules/quests";
import { archiveNpc, createNpc, editNpc, restoreNpc, trashNpc } from "@/modules/npcs";
import { archivePlayerCharacter, createPlayerCharacter, editPlayerCharacter, restorePlayerCharacter, trashPlayerCharacter } from "@/modules/player-characters";
import { archiveParty, createParty, editParty, restoreParty, trashParty } from "@/modules/parties";
import { archiveFaction, createFaction, editFaction, restoreFaction, setFactionMembership, trashFaction, type MembershipInput } from "@/modules/factions";
import { getSupportedRulesetVersion } from "@/modules/rulesets";
import { actionError, type ActionState } from "./action-state";

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function clueInput(form: FormData) {
  return { title: text(form, "title"), secret: text(form, "secret"),
    discoveryLocationId: text(form, "discoveryLocationId") || null };
}

export async function createClueAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createClue(db, await requireActor(db), { campaignId, ...clueInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/clues/${id}`);
}

export async function updateClueAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editClue(db, actor, id,
      { expectedRevision: revision, ...clueInput(form) })
      : intent === "archive" ? await archiveClue(db, actor, id, revision)
      : intent === "unarchive" ? await unarchiveClue(db, actor, id, revision)
      : intent === "trash" ? await trashClue(db, actor, id, revision)
      : intent === "restore" ? await restoreClue(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a clue action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/clues/${id}`);
  redirect(`/clues/${id}`);
}

function routeInput(form: FormData) {
  return { name: text(form, "name"), fromLocationId: text(form, "fromLocationId"),
    toLocationId: text(form, "toLocationId"), distance: text(form, "distance") || null,
    duration: text(form, "duration") || null, mode: text(form, "mode") || null,
    hazards: text(form, "hazards") || null, notes: text(form, "notes") || null };
}

function itemInput(form: FormData) {
  const locator = text(form, "locator");
  return { name: text(form, "name"), description: text(form, "description") || null,
    significance: text(form, "significance") || null, currentState: text(form, "currentState") || null,
    notes: text(form, "notes") || null, locationId: locator.startsWith("location:") ? locator.slice(9) : null,
    npcHolderId: locator.startsWith("npc:") ? locator.slice(4) : null,
    playerCharacterHolderId: locator.startsWith("pc:") ? locator.slice(3) : null };
}

function relationshipInput(form: FormData) {
  return { sourceEntityId: text(form, "sourceEntityId"), targetEntityId: text(form, "targetEntityId"),
    kind: text(form, "kind"), description: text(form, "description") || null };
}

function timelineInput(form: FormData) {
  return { title: text(form, "title"), description: text(form, "description") || null,
    occurredOn: text(form, "occurredOn") || null, inWorldDate: text(form, "inWorldDate") || null,
    entityIds: form.getAll("entityIds").filter((id): id is string => typeof id === "string") };
}

function sessionInput(form: FormData) {
  return { title: text(form, "title"), plannedFor: text(form, "plannedFor") || null,
    preparation: text(form, "preparation") || null, outcome: text(form, "outcome") || null };
}

function sceneInput(form: FormData) {
  return { title: text(form, "title"), preparation: text(form, "preparation") || null,
    outcome: text(form, "outcome") || null, position: Number(text(form, "position")) };
}

function encounterInput(form: FormData) {
  return { title: text(form, "title"), notes: text(form, "notes") || null,
    partyLevel: Number(text(form, "partyLevel")), partySize: Number(text(form, "partySize")) };
}

function encounterCreatureInput(form: FormData) {
  const xp = text(form, "xp");
  return { name: text(form, "name"), xp: xp.trim() ? Number(xp) : Number.NaN,
    quantity: Number(text(form, "quantity")) };
}

function rewardInput(form: FormData) {
  return { title: text(form, "title"), notes: text(form, "notes") || null };
}
function rewardComponentInput(form: FormData) {
  return { kind: text(form, "kind") as RewardKind, description: text(form, "description") };
}

export async function recordRewardGrantAction(rewardId: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await recordRewardGrant(db, await requireActor(db), rewardId, {
      requestKey: text(form, "requestKey"), expectedRevision: Number(text(form, "expectedRevision")),
      componentIds: form.getAll("componentIds").filter((id): id is string => typeof id === "string"),
      recipient: text(form, "recipient"), notes: text(form, "notes"),
      sessionId: text(form, "sessionId") || null,
    });
  } catch (error) { return actionError(error); }
  revalidatePath(`/rewards/${rewardId}`);
  redirect(`/rewards/${rewardId}#grant-history`);
}

export async function createRewardAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createReward(db, await requireActor(db), { campaignId, ...rewardInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/rewards/${id}`);
}

export async function updateRewardAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editReward(db, actor, id,
      { expectedRevision: revision, ...rewardInput(form) })
      : intent === "archive" ? await archiveReward(db, actor, id, revision)
      : intent === "trash" ? await trashReward(db, actor, id, revision)
      : intent === "restore" ? await restoreReward(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a reward action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/rewards/${id}`);
  redirect(`/rewards/${id}`);
}

export async function addRewardComponentAction(id: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await addRewardComponent(db, await requireActor(db), id,
      { expectedRevision: Number(text(form, "expectedRevision")), ...rewardComponentInput(form) });
  } catch (error) { return actionError(error); }
  revalidatePath(`/rewards/${id}`);
  redirect(`/rewards/${id}`);
}

export async function updateRewardComponentAction(id: string, componentId: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  try {
    const intent = text(form, "intent");
    if (intent !== "save" && intent !== "trash" && intent !== "restore")
      return { message: "Choose a component action." };
    const db = getDatabase();
    await editRewardComponent(db, await requireActor(db), id, componentId,
      { expectedRevision: Number(text(form, "expectedRevision")), intent, ...rewardComponentInput(form) });
  } catch (error) { return actionError(error); }
  revalidatePath(`/rewards/${id}`);
  redirect(`/rewards/${id}`);
}

export async function createEncounterAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createEncounter(db, await requireActor(db), { campaignId, ...encounterInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/encounters/${id}`);
}

export async function updateEncounterAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editEncounter(db, actor, id,
      { expectedRevision: revision, ...encounterInput(form) })
      : intent === "archive" ? await archiveEncounter(db, actor, id, revision)
      : intent === "trash" ? await trashEncounter(db, actor, id, revision)
      : intent === "restore" ? await restoreEncounter(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose an encounter action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/encounters/${id}`);
  redirect(`/encounters/${id}`);
}

export async function addEncounterCreatureAction(id: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await addEncounterCreature(db, await requireActor(db), id,
      { expectedRevision: Number(text(form, "expectedRevision")), ...encounterCreatureInput(form) });
  } catch (error) { return actionError(error); }
  revalidatePath(`/encounters/${id}`);
  redirect(`/encounters/${id}`);
}

export async function updateEncounterCreatureAction(id: string, creatureId: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    const intent = text(form, "intent");
    if (intent !== "save" && intent !== "trash" && intent !== "restore")
      return { message: "Choose a creature action." };
    await editEncounterCreature(db, await requireActor(db), id, creatureId,
      { expectedRevision: Number(text(form, "expectedRevision")), intent, ...encounterCreatureInput(form) });
  } catch (error) { return actionError(error); }
  revalidatePath(`/encounters/${id}`);
  redirect(`/encounters/${id}`);
}

export async function recordSessionOutcomeAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await recordSessionOutcome(db, await requireActor(db), id, {
      expectedRevision: Number(text(form, "expectedRevision")), outcome: text(form, "outcome") || null,
    });
  } catch (error) { return actionError(error); }
  revalidatePath(`/sessions/${id}`);
  revalidatePath(`/sessions/${id}/recap`);
  redirect(`/sessions/${id}/recap`);
}

export async function recordSceneOutcomeAction(id: string, sceneId: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await recordSceneOutcome(db, await requireActor(db), id, sceneId, {
      expectedRevision: Number(text(form, "expectedRevision")), outcome: text(form, "outcome") || null,
    });
  } catch (error) { return actionError(error); }
  revalidatePath(`/sessions/${id}`);
  revalidatePath(`/sessions/${id}/recap`);
  redirect(`/sessions/${id}/recap`);
}

export async function createSceneAction(sessionId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await createScene(db, await requireActor(db), sessionId,
      { expectedRevision: Number(text(form, "expectedRevision")), title: text(form, "title"),
        preparation: text(form, "preparation") || null, outcome: text(form, "outcome") || null });
  } catch (error) { return actionError(error); }
  revalidatePath(`/sessions/${sessionId}`);
  redirect(`/sessions/${sessionId}`);
}

export async function placeEncounterAction(sessionId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await placeEncounter(db, await requireActor(db), sessionId, {
      expectedRevision: Number(text(form, "expectedRevision")),
      encounterId: text(form, "encounterId"), sceneId: text(form, "sceneId") || null,
    });
  } catch (error) { return actionError(error); }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/run`);
  redirect(`/sessions/${sessionId}`);
}

export async function removeEncounterPlacementAction(sessionId: string, placementId: string,
  _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await removeEncounterPlacement(db, await requireActor(db), sessionId, placementId,
      Number(text(form, "expectedRevision")));
  } catch (error) { return actionError(error); }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/run`);
  redirect(`/sessions/${sessionId}`);
}

export async function recordEncounterRunAction(sessionId: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    await recordEncounterRun(db, await requireActor(db), sessionId, {
      expectedRevision: Number(text(form, "expectedRevision")),
      placementId: text(form, "placementId") || null,
      title: text(form, "title"), outcome: text(form, "outcome"),
    });
  } catch (error) { return actionError(error); }
  revalidatePath(`/sessions/${sessionId}/run`);
  redirect(`/sessions/${sessionId}/run#encounter-history`);
}

export async function updateSceneAction(sessionId: string, sceneId: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    const intent = text(form, "intent");
    if (intent !== "save" && intent !== "trash" && intent !== "restore") return { message: "Choose a scene action." };
    await editScene(db, await requireActor(db), sessionId, sceneId,
      { expectedRevision: Number(text(form, "expectedRevision")), intent, ...sceneInput(form) });
  } catch (error) { return actionError(error); }
  revalidatePath(`/sessions/${sessionId}`);
  redirect(`/sessions/${sessionId}`);
}

export async function createSessionAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createSession(db, await requireActor(db), { campaignId, ...sessionInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/sessions/${id}`);
}

export async function reuseSessionPreparationAction(sourceId: string, _state: ActionState,
  form: FormData): Promise<ActionState> {
  let created: { id: string; campaignId: string };
  try {
    const db = getDatabase();
    created = await reuseSessionPreparation(db, await requireActor(db), sourceId,
      Number(text(form, "expectedRevision")), text(form, "idempotencyKey"));
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${created.campaignId}`);
  redirect(`/sessions/${created.id}`);
}

export async function updateSessionAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editSession(db, actor, id, { expectedRevision: revision, ...sessionInput(form) })
      : intent === "archive" ? await archiveSession(db, actor, id, revision)
      : intent === "trash" ? await trashSession(db, actor, id, revision)
      : intent === "restore" ? await restoreSession(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a session action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}`);
}

export async function setSessionAttendanceAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    const intent = text(form, "intent");
    if (intent !== "save" && intent !== "reset") return { message: "Choose an attendance action." };
    await setSessionAttendance(db, await requireActor(db), id, {
      expectedRevision: Number(text(form, "expectedRevision")),
      playerCharacterIds: intent === "reset" ? null
        : form.getAll("playerCharacterIds").filter((value): value is string => typeof value === "string"),
    });
  } catch (error) { return actionError(error); }
  revalidatePath(`/sessions/${id}`);
  redirect(`/sessions/${id}`);
}

export async function createTimelineEventAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createTimelineEvent(db, await requireActor(db), { campaignId, ...timelineInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/timeline/${id}`);
}

export async function updateTimelineEventAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editTimelineEvent(db, actor, id, { expectedRevision: revision, ...timelineInput(form) })
      : intent === "archive" ? await archiveTimelineEvent(db, actor, id, revision)
      : intent === "trash" ? await trashTimelineEvent(db, actor, id, revision)
      : intent === "restore" ? await restoreTimelineEvent(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a timeline action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/timeline/${id}`);
  redirect(`/timeline/${id}`);
}

export async function createRelationshipAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createRelationship(db, await requireActor(db), { campaignId, ...relationshipInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/relationships/${id}`);
}

export async function updateRelationshipAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editRelationship(db, actor, id, { expectedRevision: revision, ...relationshipInput(form) })
      : intent === "archive" ? await archiveRelationship(db, actor, id, revision)
      : intent === "trash" ? await trashRelationship(db, actor, id, revision)
      : intent === "restore" ? await restoreRelationship(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a relationship action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/relationships/${id}`);
  redirect(`/relationships/${id}`);
}

export async function createItemAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createItem(db, await requireActor(db), { campaignId, ...itemInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/items/${id}`);
}

export async function updateItemAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editItem(db, actor, id, { expectedRevision: revision, ...itemInput(form) })
      : intent === "archive" ? await archiveItem(db, actor, id, revision)
      : intent === "trash" ? await trashItem(db, actor, id, revision)
      : intent === "restore" ? await restoreItem(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose an item action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/items/${id}`);
  redirect(`/items/${id}`);
}

export async function createTravelRouteAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createTravelRoute(db, await requireActor(db), { campaignId, ...routeInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/travel-routes/${id}`);
}

export async function updateTravelRouteAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editTravelRoute(db, actor, id, { expectedRevision: revision, ...routeInput(form) })
      : intent === "archive" ? await archiveTravelRoute(db, actor, id, revision)
      : intent === "trash" ? await trashTravelRoute(db, actor, id, revision)
      : intent === "restore" ? await restoreTravelRoute(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a route action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/travel-routes/${id}`);
  redirect(`/travel-routes/${id}`);
}

function blueprintInput(form: FormData) {
  return {
    title: text(form, "title"), premise: text(form, "premise"),
    setting: text(form, "setting").trim() || null,
    tone: text(form, "tone").trim() || null,
    proposedLocations: text(form, "proposedLocations").split("\n").map(line => line.trim()).filter(Boolean),
  };
}

export async function createBlueprintAction(_state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    id = (await createBlueprint(db, actor, blueprintInput(form))).id;
  } catch (error) { return actionError(error); }
  revalidatePath("/");
  redirect(`/blueprints/${id}`);
}

export async function editBlueprintAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    await editBlueprint(db, actor, id, Number(text(form, "expectedRevision")), blueprintInput(form));
  } catch (error) { return actionError(error); }
  revalidatePath(`/blueprints/${id}`);
  redirect(`/blueprints/${id}`);
}

export async function startBlueprintReviewAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    await startBlueprintReview(db, actor, id, Number(text(form, "expectedRevision")));
  } catch (error) { return actionError(error); }
  revalidatePath(`/blueprints/${id}`);
  redirect(`/blueprints/${id}/review`);
}

export async function decideBlueprintProposalAction(blueprintId: string, proposalId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    await decideBlueprintProposal(db, actor, blueprintId, proposalId, Number(text(form, "expectedRevision")), text(form, "name"), text(form, "decision") as "PENDING" | "ACCEPTED" | "REJECTED");
  } catch (error) { return actionError(error); }
  revalidatePath(`/blueprints/${blueprintId}/review`);
  redirect(`/blueprints/${blueprintId}/review`);
}

export async function materializeBlueprintAction(blueprintId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const version = await getSupportedRulesetVersion(db);
    if (!version) throw new RulesetVersionNotFoundError();
    const result = await materializeBlueprint(db, actor, { blueprintId, expectedRevision: Number(text(form, "expectedRevision")), rulesetVersionId: version.id, idempotencyKey: text(form, "idempotencyKey") });
    campaignId = result.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath("/");
  redirect(`/campaigns/${campaignId}`);
}

export async function createCampaignAction(_state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const version = await getSupportedRulesetVersion(db);
    if (!version) throw new RulesetVersionNotFoundError();
    const created = await createCampaign(db, actor, {
      name: text(form, "name"), originalPremise: text(form, "originalPremise"), rulesetVersionId: version.id,
      description: text(form, "description").trim() || undefined,
      setting: text(form, "setting").trim() || undefined,
      tone: text(form, "tone").trim() || undefined,
      originalNotes: text(form, "originalNotes").trim() || undefined,
    });
    id = created.id;
  } catch (error) { return actionError(error); }
  revalidatePath("/");
  redirect(`/campaigns/${id}`);
}

export async function createLocationAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const created = await createLocation(db, actor, {
      campaignId, name: text(form, "name"), description: text(form, "description") || null,
    });
    id = created.id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/locations/${id}`);
}

export async function createArcAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    id = (await createArc(db, actor, { campaignId, name: text(form, "name"), description: text(form, "description") || null })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/arcs/${id}`);
}

export async function updateArcAction(arcId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save"
      ? await editArc(db, actor, arcId, { expectedRevision: revision, name: text(form, "name"), description: text(form, "description") || null })
      : intent === "archive" ? await archiveArc(db, actor, arcId, revision)
      : intent === "trash" ? await trashArc(db, actor, arcId, revision)
      : intent === "restore" ? await restoreArc(db, actor, arcId, revision)
      : null;
    if (!updated) return { message: "Choose an arc action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/arcs/${arcId}`);
  redirect(`/arcs/${arcId}`);
}

function npcInput(form: FormData) {
  return { name: text(form, "name"), description: text(form, "description") || null,
    role: text(form, "role") || null, currentState: text(form, "currentState") || null };
}

export async function createNpcAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    id = (await createNpc(db, actor, { campaignId, ...npcInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/npcs/${id}`);
}

export async function updateNpcAction(npcId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editNpc(db, actor, npcId, { expectedRevision: revision, ...npcInput(form) })
      : intent === "archive" ? await archiveNpc(db, actor, npcId, revision)
      : intent === "trash" ? await trashNpc(db, actor, npcId, revision)
      : intent === "restore" ? await restoreNpc(db, actor, npcId, revision) : null;
    if (!updated) return { message: "Choose an NPC action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/npcs/${npcId}`);
  redirect(`/npcs/${npcId}`);
}

function playerCharacterInput(form: FormData) {
  return { name: text(form, "name"), playerName: text(form, "playerName") || null,
    description: text(form, "description") || null, currentState: text(form, "currentState") || null };
}

export async function createPlayerCharacterAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    id = (await createPlayerCharacter(db, actor, { campaignId, ...playerCharacterInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/player-characters/${id}`);
}

export async function updatePlayerCharacterAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editPlayerCharacter(db, actor, id, { expectedRevision: revision, ...playerCharacterInput(form) })
      : intent === "archive" ? await archivePlayerCharacter(db, actor, id, revision)
      : intent === "trash" ? await trashPlayerCharacter(db, actor, id, revision)
      : intent === "restore" ? await restorePlayerCharacter(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a character action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/player-characters/${id}`);
  redirect(`/player-characters/${id}`);
}

function partyInput(form: FormData) {
  return { name: text(form, "name"), description: text(form, "description") || null,
    playerCharacterIds: form.getAll("playerCharacterIds").filter((id): id is string => typeof id === "string") };
}

function factionInput(form: FormData) {
  return { name: text(form, "name"), description: text(form, "description") || null,
    purpose: text(form, "purpose") || null, currentState: text(form, "currentState") || null };
}

export async function createFactionAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    id = (await createFaction(db, await requireActor(db), { campaignId, ...factionInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/factions/${id}`);
}

export async function updateFactionAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editFaction(db, actor, id, { expectedRevision: revision, ...factionInput(form) })
      : intent === "archive" ? await archiveFaction(db, actor, id, revision)
      : intent === "trash" ? await trashFaction(db, actor, id, revision)
      : intent === "restore" ? await restoreFaction(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a faction action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/factions/${id}`);
  redirect(`/factions/${id}`);
}

export async function setFactionMembershipAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const [memberType, memberId] = text(form, "member").split(":");
    const updated = await setFactionMembership(db, actor, id, Number(text(form, "expectedRevision")), {
      memberType: memberType as MembershipInput["memberType"], memberId,
      role: text(form, "role") || null, rank: text(form, "rank") || null,
      status: text(form, "status") as MembershipInput["status"],
    });
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/factions/${id}`);
  redirect(`/factions/${id}`);
}

export async function createPartyAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    id = (await createParty(db, actor, { campaignId, ...partyInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/parties/${id}`);
}

export async function updatePartyAction(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editParty(db, actor, id, { expectedRevision: revision, ...partyInput(form) })
      : intent === "archive" ? await archiveParty(db, actor, id, revision)
      : intent === "trash" ? await trashParty(db, actor, id, revision)
      : intent === "restore" ? await restoreParty(db, actor, id, revision) : null;
    if (!updated) return { message: "Choose a party action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/parties/${id}`);
  redirect(`/parties/${id}`);
}

function questInput(form: FormData) {
  return { name: text(form, "name"), description: text(form, "description") || null,
    status: text(form, "status") as QuestStatus,
    parentQuestId: text(form, "parentQuestId") || null,
    arcIds: form.getAll("arcIds").filter((id): id is string => typeof id === "string") };
}

export async function createQuestAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    id = (await createQuest(db, actor, { campaignId, ...questInput(form) })).id;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/quests/${id}`);
}

export async function updateQuestAction(questId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save" ? await editQuest(db, actor, questId, { expectedRevision: revision, ...questInput(form) })
      : intent === "archive" ? await archiveQuest(db, actor, questId, revision)
      : intent === "trash" ? await trashQuest(db, actor, questId, revision)
      : intent === "restore" ? await restoreQuest(db, actor, questId, revision) : null;
    if (!updated) return { message: "Choose a quest action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/quests/${questId}`);
  redirect(`/quests/${questId}`);
}

export async function editCompassAction(campaignId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    await editCompass(db, actor, campaignId, {
      expectedRevision: Number(text(form, "expectedRevision")),
      currentPremise: text(form, "currentPremise"),
      setting: text(form, "setting").trim() || null,
      tone: text(form, "tone").trim() || null,
    });
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  redirect(`/campaigns/${campaignId}`);
}

export async function updateLocationAction(locationId: string, _state: ActionState, form: FormData): Promise<ActionState> {
  let campaignId: string;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text(form, "expectedRevision"));
    const intent = text(form, "intent");
    const updated = intent === "save"
      ? await editLocation(db, actor, locationId, {
        expectedRevision: revision, name: text(form, "name"), description: text(form, "description") || null,
      })
      : intent === "archive" ? await archiveLocation(db, actor, locationId, revision)
      : intent === "trash" ? await trashLocation(db, actor, locationId, revision)
      : intent === "restore" ? await restoreLocation(db, actor, locationId, revision)
      : null;
    if (!updated) return { message: "Choose a location action." };
    campaignId = updated.campaignId;
  } catch (error) { return actionError(error); }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/locations/${locationId}`);
  redirect(`/locations/${locationId}`);
}

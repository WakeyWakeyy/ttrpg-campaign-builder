"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { createCampaign, editCompass, RulesetVersionNotFoundError } from "@/modules/campaigns";
import { archiveLocation, createLocation, editLocation, restoreLocation, trashLocation } from "@/modules/locations";
import { getSupportedRulesetVersion } from "@/modules/rulesets";
import { actionError, type ActionState } from "./action-state";

function text(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
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

"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { archiveLocation, editLocation, getOwnedLocation, LocationRevisionConflictError, restoreLocation, trashLocation } from "@/modules/locations";
import { actionError } from "./action-state";
import type { LocationResult, LocationSnapshot } from "./location-editor-state";

function snapshot({ id, name, description, revision, archivedAt, deletedAt }: LocationSnapshot): LocationSnapshot {
  return { id, name, description, revision, archivedAt, deletedAt };
}

function failure(error: unknown): LocationResult {
  if (error instanceof LocationRevisionConflictError) return { ok: false, conflict: true,
    message: "This location changed since you opened it. Your draft is preserved. View the persisted version before saving again." };
  return { ok: false, ...actionError(error) };
}

export async function readLocationAction(id: string): Promise<LocationResult> {
  try {
    const db = getDatabase();
    return { ok: true, location: snapshot(await getOwnedLocation(db, await requireActor(db), id)) };
  } catch (error) { return failure(error); }
}

export async function updateLocationAction(id: string, form: FormData): Promise<LocationResult> {
  const text = (name: string) => typeof form.get(name) === "string" ? form.get(name) as string : "";
  let updated: Awaited<ReturnType<typeof editLocation>>;
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const revision = Number(text("expectedRevision"));
    const intent = text("intent");
    const result = intent === "save" ? await editLocation(db, actor, id, {
      expectedRevision: revision, name: text("name"), description: text("description") || null,
    }) : intent === "archive" ? await archiveLocation(db, actor, id, revision)
      : intent === "trash" ? await trashLocation(db, actor, id, revision)
      : intent === "restore" ? await restoreLocation(db, actor, id, revision) : null;
    if (!result) return { ok: false, message: "Choose a location action." };
    updated = result;
  } catch (error) { return failure(error); }
  // Commands resolve after their transaction commits. Keep invalidation and
  // explicit success outside the error adapter, as in the other actions.
  revalidatePath(`/campaigns/${updated.campaignId}`);
  revalidatePath(`/locations/${id}`);
  return { ok: true, location: snapshot(updated) };
}

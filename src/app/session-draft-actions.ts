"use server";

import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedSession, listSessionScenes, SceneNotFoundError } from "@/modules/sessions";
import { actionError } from "./action-state";
import { sessionDraftSnapshot, type SessionDraftSnapshot, type SessionDraftTarget } from "./session-draft-state";

export async function readSessionDraftAction(sessionId: string, target: SessionDraftTarget): Promise<
  { ok: true; snapshot: SessionDraftSnapshot } | { ok: false; message: string }
> {
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    // Read the parent first: an intervening write can make this revision stale,
    // never authorize an unseen older scene against a newer parent revision.
    const parent = await getOwnedSession(db, actor, sessionId);
    if (target.kind === "scene" || target.kind === "scene-outcome") {
      const scene = (await listSessionScenes(db, actor, sessionId)).find(item => item.id === target.sceneId);
      if (!scene) throw new SceneNotFoundError();
      return { ok: true, snapshot: sessionDraftSnapshot(parent.revision, target.kind, scene, !!parent.deletedAt) };
    }
    if (!["session", "session-outcome", "new-scene"].includes(target.kind)) return { ok: false, message: "Choose a session section." };
    return { ok: true, snapshot: sessionDraftSnapshot(parent.revision, target.kind, parent) };
  } catch (error) { return { ok: false, message: actionError(error).message }; }
}

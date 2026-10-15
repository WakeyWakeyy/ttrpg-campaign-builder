import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getOwnedCampaign } from "../campaigns";
import { listSessionEncounterPlacements } from "../encounters";
import type { Actor } from "../identity";
import { listOwnedPlayerCharacters } from "../player-characters";
import { getOwnedSession, getPreviousSessionContext, listSessionAttendance, listSessionScenes } from "../sessions";

export type SessionSheet = {
  campaignName: string;
  title: string;
  plannedFor: string | null;
  preparation: string | null;
  attendance: string[] | null;
  previous: { title: string; outcome: string | null; scenes: { title: string; outcome: string | null }[] } | null;
  scenes: { id: string; title: string; preparation: string | null }[];
  encounters: { title: string; sceneId: string | null }[];
};

/** Read one authorized session and its preparation from a consistent database snapshot. */
export async function buildSessionSheet(db: NodePgDatabase, actor: Actor, sessionId: string): Promise<SessionSheet> {
  return db.transaction(async tx => {
    const current = await getOwnedSession(tx, actor, sessionId);
    const campaign = await getOwnedCampaign(tx, actor, current.campaignId);
    const [scenes, previous, attendance, characters, placements] = await Promise.all([
      listSessionScenes(tx, actor, sessionId), getPreviousSessionContext(tx, actor, sessionId),
      listSessionAttendance(tx, actor, sessionId), listOwnedPlayerCharacters(tx, actor, current.campaignId),
      listSessionEncounterPlacements(tx, actor, sessionId),
    ]);
    const attendees = new Set(attendance.map(row => row.playerCharacterId));
    const availableScenes = scenes.filter(scene => !scene.deletedAt);
    return {
      campaignName: campaign.name, title: current.title, plannedFor: current.plannedFor,
      preparation: current.preparation,
      attendance: current.attendanceSet ? characters.filter(character => attendees.has(character.id)).map(character => character.name) : null,
      previous: previous ? { title: previous.session.title, outcome: previous.session.outcome, scenes: previous.scenes } : null,
      scenes: availableScenes.map(scene => ({ id: scene.id, title: scene.title, preparation: scene.preparation })),
      encounters: placements.filter(placement => !placement.encounterDeletedAt && !placement.encounterArchivedAt && !placement.sceneDeletedAt
        && (!placement.sceneId || availableScenes.some(scene => scene.id === placement.sceneId)))
        .map(placement => ({ title: placement.title, sceneId: placement.sceneId })),
    };
  }, { isolationLevel: "repeatable read" });
}

export function renderSessionSheet(sheet: SessionSheet): string {
  const out = [`# ${sheet.title}`, "", `Campaign: ${sheet.campaignName}`, `Planned date: ${sheet.plannedFor ?? "Not set"}`, ""];
  const addText = (value: string | null) => out.push(value?.trim() || "No notes yet.", "");
  out.push("## Previous session", "");
  if (sheet.previous) {
    out.push(`**${sheet.previous.title}**`, "");
    addText(sheet.previous.outcome);
    for (const scene of sheet.previous.scenes) out.push(`- ${scene.title}: ${scene.outcome?.trim() ?? ""}`);
    if (sheet.previous.scenes.length) out.push("");
  } else out.push("No previous session recorded.", "");
  out.push("## Attendance", "", sheet.attendance === null ? "Not recorded."
    : sheet.attendance.length ? sheet.attendance.join(", ") : "None recorded.", "");
  out.push("## Session preparation", "");
  addText(sheet.preparation);
  const sessionEncounters = sheet.encounters.filter(encounter => !encounter.sceneId);
  if (sessionEncounters.length) out.push("### Session encounters", "", ...sessionEncounters.map(encounter => `- ${encounter.title}`), "");
  out.push("## Scenes", "");
  if (!sheet.scenes.length) out.push("No scenes planned.", "");
  for (const [index, scene] of sheet.scenes.entries()) {
    out.push(`### ${index + 1}. ${scene.title}`, "");
    addText(scene.preparation);
    const encounters = sheet.encounters.filter(encounter => encounter.sceneId === scene.id);
    if (encounters.length) out.push("Encounters:", ...encounters.map(encounter => `- ${encounter.title}`), "");
  }
  return out.join("\n").trimEnd() + "\n";
}

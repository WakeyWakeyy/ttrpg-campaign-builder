import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { listOwnedArcs } from "@/modules/arcs";
import { getOwnedQuest, listOwnedQuests, listQuestArcIds } from "@/modules/quests";
import { ActionForm } from "../../action-form";
import { updateQuestAction } from "../../actions";
import { readError } from "../../read-error";

const statuses = ["OPEN", "RESOLVED", "FAILED", "POSTPONED", "ABANDONED"] as const;
export default async function QuestPage({ params }: { params: Promise<{ questId: string }> }) {
  const { questId } = await params;
  const data = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const quest = await getOwnedQuest(db, actor, questId);
    const [quests, arcs, arcIds] = await Promise.all([
      listOwnedQuests(db, actor, quest.campaignId), listOwnedArcs(db, actor, quest.campaignId), listQuestArcIds(db, actor, questId),
    ]);
    return { quest, quests, arcs, arcIds };
  })().catch(readError);
  const { quest } = data;
  return <main>
    <Link href={`/campaigns/${quest.campaignId}#quests`}>Back to campaign quests</Link>
    <h1>{quest.name}</h1>
    <p className="status">{quest.deletedAt ? "Trashed" : quest.archivedAt ? "Archived" : "Active"} · {quest.status.toLowerCase()}</p>
    {quest.deletedAt && <p>Restore returns this quest to {quest.archivedAt ? "Archived" : "Active"}.</p>}
    <ActionForm key={quest.revision} action={updateQuestAction.bind(null, quest.id)} reloadLabel="Reload quest">
      <input type="hidden" name="expectedRevision" value={quest.revision} />
      <label htmlFor="quest-name">Name</label><input id="quest-name" name="name" defaultValue={quest.name} required readOnly={!!quest.deletedAt} />
      <label htmlFor="quest-description">Description</label><textarea id="quest-description" name="description" defaultValue={quest.description ?? ""} rows={8} readOnly={!!quest.deletedAt} />
      <label htmlFor="quest-status">Status</label><select id="quest-status" name="status" defaultValue={quest.status} disabled={!!quest.deletedAt}>
        {statuses.map(status => <option key={status} value={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</option>)}
      </select>
      <label htmlFor="quest-parent">Parent quest</label><select id="quest-parent" name="parentQuestId" defaultValue={quest.parentQuestId ?? ""} disabled={!!quest.deletedAt}>
        <option value="">None</option>{data.quests.filter(item => item.id !== quest.id && (!item.deletedAt || item.id === quest.parentQuestId)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <fieldset disabled={!!quest.deletedAt}><legend>Arcs</legend>{data.arcs.filter(arc => !arc.deletedAt || data.arcIds.includes(arc.id)).map(arc =>
        <label key={arc.id}><input type="checkbox" name="arcIds" value={arc.id} defaultChecked={data.arcIds.includes(arc.id)} /> {arc.name}</label>)}</fieldset>
      <div className="actions">
        {!quest.deletedAt && <button name="intent" value="save">Save quest</button>}
        {!quest.deletedAt && !quest.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!quest.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {quest.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
  </main>;
}

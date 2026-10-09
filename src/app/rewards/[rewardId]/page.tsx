import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedReward, listRewardComponents, rewardKinds } from "@/modules/rewards";
import { ActionForm } from "../../action-form";
import { addRewardComponentAction, updateRewardAction, updateRewardComponentAction } from "../../actions";
import { readError } from "../../read-error";

export default async function RewardPage({ params }: { params: Promise<{ rewardId: string }> }) {
  const { rewardId } = await params;
  const { item, components } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    return { item: await getOwnedReward(db, actor, rewardId),
      components: await listRewardComponents(db, actor, rewardId) };
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${item.campaignId}#rewards`}>Back to campaign</Link>
    <h1>{item.title}</h1>
    <p>{item.deletedAt ? "In trash" : item.archivedAt ? "Archived" : "Active"}</p>
    {item.deletedAt && <p>Restore returns this reward to {item.archivedAt ? "Archived" : "Active"}.</p>}
    <p>This is a plan. Record what was actually given in a future Reward Grant.</p>
    <ActionForm key={item.revision} action={updateRewardAction.bind(null, item.id)} reloadLabel="Reload reward">
      <input type="hidden" name="expectedRevision" value={item.revision} />
      <label htmlFor="reward-title">Title</label>
      <input id="reward-title" name="title" defaultValue={item.title} required maxLength={200} readOnly={!!item.deletedAt} />
      <label htmlFor="reward-notes">Planning notes</label>
      <textarea id="reward-notes" name="notes" defaultValue={item.notes ?? ""} rows={5} readOnly={!!item.deletedAt} />
      <div className="actions">
        {!item.deletedAt && <button name="intent" value="save">Save reward</button>}
        {!item.deletedAt && !item.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!item.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {item.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
    <section aria-labelledby="reward-components-heading">
      <h2 id="reward-components-heading">Planned components</h2>
      {components.length ? <ul>{components.map(component => <li key={component.id}>
        <h3>{component.kind.toLowerCase()}{component.deletedAt ? " · Removed" : ""}</h3>
        <ActionForm key={`${component.id}-${item.revision}`}
          action={updateRewardComponentAction.bind(null, item.id, component.id)} reloadLabel="Reload reward">
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label htmlFor={`component-kind-${component.id}`}>Kind</label>
          <select id={`component-kind-${component.id}`} name="kind" defaultValue={component.kind}
            disabled={!!item.deletedAt || !!component.deletedAt}>
            {rewardKinds.map(kind => <option key={kind} value={kind}>{kind.toLowerCase()}</option>)}
          </select>
          <label htmlFor={`component-description-${component.id}`}>Description</label>
          <textarea id={`component-description-${component.id}`} name="description" defaultValue={component.description}
            required maxLength={1000} readOnly={!!item.deletedAt || !!component.deletedAt} />
          {!item.deletedAt && <div className="actions">
            {!component.deletedAt && <button name="intent" value="save">Save component</button>}
            {!component.deletedAt && <button name="intent" value="trash" formNoValidate>Remove component</button>}
            {component.deletedAt && <button name="intent" value="restore" formNoValidate>Restore component</button>}
          </div>}
        </ActionForm>
      </li>)}</ul> : <p>No components yet.</p>}
      {!item.deletedAt && <>
        <h3>Add component</h3>
        <ActionForm key={item.revision} action={addRewardComponentAction.bind(null, item.id)} reloadLabel="Reload reward">
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label htmlFor="new-component-kind">Kind</label>
          <select id="new-component-kind" name="kind">{rewardKinds.map(kind =>
            <option key={kind} value={kind}>{kind.toLowerCase()}</option>)}</select>
          <label htmlFor="new-component-description">Description</label>
          <textarea id="new-component-description" name="description" required maxLength={1000} />
          <button type="submit">Add component</button>
        </ActionForm>
      </>}
    </section>
  </main>;
}

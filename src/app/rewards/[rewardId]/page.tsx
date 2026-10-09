import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedReward, listRewardComponents, rewardKinds } from "@/modules/rewards";
import { listRewardGrants } from "@/modules/rewards/grants";
import { listOwnedSessions } from "@/modules/sessions";
import { ActionForm } from "../../action-form";
import { addRewardComponentAction, recordRewardGrantAction, updateRewardAction, updateRewardComponentAction } from "../../actions";
import { readError } from "../../read-error";

export default async function RewardPage({ params }: { params: Promise<{ rewardId: string }> }) {
  const { rewardId } = await params;
  const { item, components, grants, sessions } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const item = await getOwnedReward(db, actor, rewardId);
    return { item, components: await listRewardComponents(db, actor, rewardId),
      grants: await listRewardGrants(db, actor, item.campaignId),
      sessions: await listOwnedSessions(db, actor, item.campaignId) };
  })().catch(readError);
  return <main>
    <Link href={`/campaigns/${item.campaignId}#rewards`}>Back to campaign</Link>
    <h1>{item.title}</h1>
    <p>{item.deletedAt ? "In trash" : item.archivedAt ? "Archived" : "Active"}</p>
    {item.deletedAt && <p>Restore returns this reward to {item.archivedAt ? "Archived" : "Active"}.</p>}
    <p>This plan can be reused. A grant records what was actually given and keeps a copy of the selected components.</p>
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
    <section aria-labelledby="reward-grant-heading">
      <h2 id="reward-grant-heading">Record a grant</h2>
      {!item.deletedAt && components.some(component => !component.deletedAt) ?
        <ActionForm action={recordRewardGrantAction.bind(null, item.id)} reloadLabel="Reload reward">
          <input type="hidden" name="requestKey" value={randomUUID()} />
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <fieldset><legend>Components actually given</legend>
            {components.filter(component => !component.deletedAt).map(component =>
              <label key={component.id}><input type="checkbox" name="componentIds" value={component.id} />
                {component.kind.toLowerCase()}: {component.description}</label>)}</fieldset>
          <label htmlFor="grant-recipient">Given to</label>
          <input id="grant-recipient" name="recipient" required maxLength={200}
            placeholder="Character, party, or other recipient" />
          <label htmlFor="grant-session">Session (optional)</label>
          <select id="grant-session" name="sessionId"><option value="">No session</option>
            {sessions.filter(session => !session.deletedAt).map(session =>
              <option key={session.id} value={session.id}>{session.title}</option>)}</select>
          <label htmlFor="grant-notes">What happened (optional)</label>
          <textarea id="grant-notes" name="notes" maxLength={10000} rows={3} />
          <button type="submit">Record grant</button>
        </ActionForm> : <p>Restore the plan and add an available component before recording a grant.</p>}
    </section>
    <section id="grant-history" aria-labelledby="grant-history-heading">
      <h2 id="grant-history-heading">Grant ledger</h2>
      {grants.length ? <ol>{grants.map(grant => <li key={grant.id}>
        <strong>{grant.rewardTitle}</strong> to {grant.recipient} ·
        <time dateTime={grant.grantedAt.toISOString()}>{grant.grantedAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC</time>
        {grant.sessionId && <span> · {sessions.find(session => session.id === grant.sessionId)?.title ?? "Session removed"}</span>}
        <ul>{grant.components.map(component => <li key={component.id}>
          {component.kind.toLowerCase()}: {component.description}</li>)}</ul>
        {grant.notes && <p className="preserve-lines">{grant.notes}</p>}
      </li>)}</ol> : <p>No grants recorded in this campaign yet.</p>}
    </section>
  </main>;
}

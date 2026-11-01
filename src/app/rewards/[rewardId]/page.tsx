import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedReward, listRewardComponents, rewardKinds } from "@/modules/rewards";
import { listRewardGrants } from "@/modules/rewards/grants";
import { listOwnedSessions } from "@/modules/sessions";
import { PlanningDraftForm, PlanningSubmit } from "../../planning-draft-form";
import { rewardDraftSnapshot } from "../../reward-draft";
import { readRewardDraftAction } from "../../reward-draft-actions";
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
    <PlanningDraftForm key="reward" action={updateRewardAction.bind(null, item.id)}
      snapshot={rewardDraftSnapshot(item.revision, "reward", item)}
      read={readRewardDraftAction.bind(null, item.id, { kind: "reward" })}>
      <label htmlFor="reward-title">Title</label>
      <input id="reward-title" name="title" defaultValue={item.title} required maxLength={200} readOnly={!!item.deletedAt} />
      <label htmlFor="reward-notes">Planning notes</label>
      <textarea id="reward-notes" name="notes" defaultValue={item.notes ?? ""} rows={5} readOnly={!!item.deletedAt} />
      <div className="actions">
        {!item.deletedAt && <PlanningSubmit name="intent" value="save">Save reward</PlanningSubmit>}
        {!item.deletedAt && !item.archivedAt && <PlanningSubmit name="intent" value="archive" formNoValidate>Archive</PlanningSubmit>}
        {!item.deletedAt && <PlanningSubmit name="intent" value="trash" formNoValidate>Trash</PlanningSubmit>}
        {item.deletedAt && <PlanningSubmit name="intent" value="restore" formNoValidate>Restore</PlanningSubmit>}
      </div>
    </PlanningDraftForm>
    <section aria-labelledby="reward-components-heading">
      <h2 id="reward-components-heading">Planned components</h2>
      {components.length ? <ul>{components.map(component => <li key={component.id}>
        <h3>{component.kind.toLowerCase()}{component.deletedAt ? " · Removed" : ""}</h3>
        <PlanningDraftForm key={component.id} action={updateRewardComponentAction.bind(null, item.id, component.id)}
          snapshot={rewardDraftSnapshot(item.revision, "component", component, !!item.deletedAt)}
          read={readRewardDraftAction.bind(null, item.id, { kind: "component", componentId: component.id })}>
          <label htmlFor={`component-kind-${component.id}`}>Kind</label>
          <select id={`component-kind-${component.id}`} name="kind" defaultValue={component.kind}
            disabled={!!item.deletedAt || !!component.deletedAt}>
            {rewardKinds.map(kind => <option key={kind} value={kind}>{kind.toLowerCase()}</option>)}
          </select>
          <label htmlFor={`component-description-${component.id}`}>Description</label>
          <textarea id={`component-description-${component.id}`} name="description" defaultValue={component.description}
            required maxLength={1000} readOnly={!!item.deletedAt || !!component.deletedAt} />
          {!item.deletedAt && <div className="actions">
            {!component.deletedAt && <PlanningSubmit name="intent" value="save">Save component</PlanningSubmit>}
            {!component.deletedAt && <PlanningSubmit name="intent" value="trash" formNoValidate>Remove component</PlanningSubmit>}
            {component.deletedAt && <PlanningSubmit name="intent" value="restore" formNoValidate>Restore component</PlanningSubmit>}
          </div>}
        </PlanningDraftForm>
      </li>)}</ul> : <p>No components yet.</p>}
      <>
        <h3>Add component</h3>
        <PlanningDraftForm key="new-component" action={addRewardComponentAction.bind(null, item.id)}
          snapshot={rewardDraftSnapshot(item.revision, "new-component", item)}
          read={readRewardDraftAction.bind(null, item.id, { kind: "new-component" })}>
          <fieldset disabled={!!item.deletedAt}>
          <label htmlFor="new-component-kind">Kind</label>
          <select id="new-component-kind" name="kind">{rewardKinds.map(kind =>
            <option key={kind} value={kind}>{kind.toLowerCase()}</option>)}</select>
          <label htmlFor="new-component-description">Description</label>
          <textarea id="new-component-description" name="description" required maxLength={1000} />
          <PlanningSubmit type="submit">Add component</PlanningSubmit>
          </fieldset>
        </PlanningDraftForm>
      </>
    </section>
    <section aria-labelledby="reward-grant-heading">
      <h2 id="reward-grant-heading">Record a grant</h2>
        <PlanningDraftForm key="grant" action={recordRewardGrantAction.bind(null, item.id)} requestKey={randomUUID()}
          snapshot={rewardDraftSnapshot(item.revision, "grant", item)}
          read={readRewardDraftAction.bind(null, item.id, { kind: "grant" })}>
          <fieldset disabled={!!item.deletedAt}>
          <fieldset><legend>Components actually given</legend>
            {components.map(component =>
              <label key={component.id}><input type="checkbox" name="componentIds" value={component.id} />
                {component.kind.toLowerCase()}: {component.description}{component.deletedAt ? " (removed — unavailable for grants)" : ""}</label>)}</fieldset>
          <label htmlFor="grant-recipient">Given to</label>
          <input id="grant-recipient" name="recipient" required maxLength={200}
            placeholder="Character, party, or other recipient" />
          <label htmlFor="grant-session">Session (optional)</label>
          <select id="grant-session" name="sessionId"><option value="">No session</option>
            {sessions.map(session =>
              <option key={session.id} value={session.id}>{session.title}{session.deletedAt ? " (in trash — unavailable)" : ""}</option>)}</select>
          <label htmlFor="grant-notes">What happened (optional)</label>
          <textarea id="grant-notes" name="notes" maxLength={10000} rows={3} />
          <PlanningSubmit type="submit" disabled={!components.some(component => !component.deletedAt)}>Record grant</PlanningSubmit>
          </fieldset>
        </PlanningDraftForm>
      {(item.deletedAt || !components.some(component => !component.deletedAt)) && <p>Restore the plan and add an available component before recording a grant.</p>}
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

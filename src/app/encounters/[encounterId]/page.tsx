import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedEncounter, listEncounterCreatures } from "@/modules/encounters";
import { getCampaignRulesetVersion } from "@/modules/rulesets";
import { calculateEncounterBudgetForGroups } from "@/modules/rulesets/encounter-budget";
import { ActionForm } from "../../action-form";
import { addEncounterCreatureAction, updateEncounterAction, updateEncounterCreatureAction } from "../../actions";
import { readError } from "../../read-error";

export default async function EncounterPage({ params }: { params: Promise<{ encounterId: string }> }) {
  const { encounterId } = await params;
  const { item, creatures, pin } = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const item = await getOwnedEncounter(db, actor, encounterId);
    return { item, creatures: await listEncounterCreatures(db, actor, encounterId),
      pin: await getCampaignRulesetVersion(db, actor, item.campaignId) };
  })().catch(readError);
  const active = creatures.filter(creature => !creature.deletedAt);
  const budget = pin ? calculateEncounterBudgetForGroups({ rulesetKey: pin.rulesetKey, version: pin.version,
    partyLevel: item.partyLevel, partySize: item.partySize,
    creatures: active.map(creature => ({ xp: creature.xp, quantity: creature.quantity })) }) : null;
  const number = (value: number) => value.toLocaleString("en-US");
  return <main>
    <Link href={`/campaigns/${item.campaignId}#encounters`}>Back to campaign</Link>
    <h1>{item.title}</h1>
    <p>{item.deletedAt ? "In trash" : item.archivedAt ? "Archived" : "Active"}</p>
    {item.deletedAt && <p>Restore returns this encounter to {item.archivedAt ? "Archived" : "Active"}.</p>}
    <p>This definition is independent of a Session. Placement in a Session or Scene comes later.</p>
    <ActionForm key={item.revision} action={updateEncounterAction.bind(null, item.id)} reloadLabel="Reload encounter">
      <input type="hidden" name="expectedRevision" value={item.revision} />
      <label htmlFor="encounter-title">Title</label>
      <input id="encounter-title" name="title" defaultValue={item.title} required maxLength={200} readOnly={!!item.deletedAt} />
      <label htmlFor="encounter-notes">Preparation notes</label>
      <textarea id="encounter-notes" name="notes" defaultValue={item.notes ?? ""} rows={5} readOnly={!!item.deletedAt} />
      <label htmlFor="encounter-level">Party level</label>
      <input id="encounter-level" name="partyLevel" type="number" min="1" max="20" defaultValue={item.partyLevel}
        required readOnly={!!item.deletedAt} />
      <label htmlFor="encounter-size">Number of characters</label>
      <input id="encounter-size" name="partySize" type="number" min="1" max="20" defaultValue={item.partySize}
        required readOnly={!!item.deletedAt} />
      <div className="actions">
        {!item.deletedAt && <button name="intent" value="save">Save encounter</button>}
        {!item.deletedAt && !item.archivedAt && <button name="intent" value="archive" formNoValidate>Archive</button>}
        {!item.deletedAt && <button name="intent" value="trash" formNoValidate>Trash</button>}
        {item.deletedAt && <button name="intent" value="restore" formNoValidate>Restore</button>}
      </div>
    </ActionForm>
    {budget && <section aria-labelledby="encounter-budget-heading">
      <h2 id="encounter-budget-heading">XP budget</h2>
      <p>{item.partySize} level {item.partyLevel} character{item.partySize === 1 ? "" : "s"} · {pin?.name}</p>
      <p>Low {number(budget.budgets.low)} · Moderate {number(budget.budgets.moderate)} · High {number(budget.budgets.high)} XP</p>
      <p>Planned creatures: {number(budget.totalXp)} XP.
        {budget.totalXp > budget.budgets.high ? " Above the high budget."
          : budget.totalXp > budget.budgets.moderate ? " Within the high budget."
          : budget.totalXp > budget.budgets.low ? " Within the moderate budget."
          : " Within the low budget."}</p>
      <p>This compares XP budgets; it does not predict every combat outcome.</p>
    </section>}
    <section aria-labelledby="encounter-creatures-heading">
      <h2 id="encounter-creatures-heading">Creatures</h2>
      {creatures.length ? <ul>{creatures.map(creature => <li key={creature.id}>
        <h3>{creature.name}{creature.deletedAt ? " · Removed" : ""}</h3>
        <ActionForm key={`${creature.id}-${item.revision}`} action={updateEncounterCreatureAction.bind(null, item.id, creature.id)}
          reloadLabel="Reload encounter">
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label htmlFor={`creature-name-${creature.id}`}>Name</label>
          <input id={`creature-name-${creature.id}`} name="name" defaultValue={creature.name} required maxLength={200}
            readOnly={!!item.deletedAt || !!creature.deletedAt} />
          <label htmlFor={`creature-xp-${creature.id}`}>XP per creature</label>
          <input id={`creature-xp-${creature.id}`} name="xp" type="number" min="0" max="2147483647"
            defaultValue={creature.xp} required readOnly={!!item.deletedAt || !!creature.deletedAt} />
          <label htmlFor={`creature-quantity-${creature.id}`}>Quantity</label>
          <input id={`creature-quantity-${creature.id}`} name="quantity" type="number" min="1" max="100"
            defaultValue={creature.quantity} required readOnly={!!item.deletedAt || !!creature.deletedAt} />
          {!item.deletedAt && <div className="actions">
            {!creature.deletedAt && <button name="intent" value="save">Save creature</button>}
            {!creature.deletedAt && <button name="intent" value="trash" formNoValidate>Remove creature</button>}
            {creature.deletedAt && <button name="intent" value="restore" formNoValidate>Restore creature</button>}
          </div>}
        </ActionForm>
      </li>)}</ul> : <p>No creatures yet.</p>}
      {!item.deletedAt && <>
        <h3>Add creature</h3>
        <ActionForm key={item.revision} action={addEncounterCreatureAction.bind(null, item.id)} reloadLabel="Reload encounter">
          <input type="hidden" name="expectedRevision" value={item.revision} />
          <label htmlFor="new-creature-name">Name</label><input id="new-creature-name" name="name" required maxLength={200} />
          <label htmlFor="new-creature-xp">XP per creature</label>
          <input id="new-creature-xp" name="xp" type="number" min="0" max="2147483647" required />
          <label htmlFor="new-creature-quantity">Quantity</label>
          <input id="new-creature-quantity" name="quantity" type="number" min="1" max="100" defaultValue="1" required />
          <button type="submit">Add creature</button>
        </ActionForm>
      </>}
    </section>
  </main>;
}

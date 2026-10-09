"use client";

import { useState } from "react";
import { calculateEncounterBudget, InvalidEncounterBudgetInputError,
  UnsupportedEncounterRulesetError } from "@/modules/rulesets/encounter-budget";

export function EncounterBudgetCalculator({ rulesetKey, version }: { rulesetKey: string; version: string }) {
  const [partyLevel, setPartyLevel] = useState(1);
  const [partySize, setPartySize] = useState(4);
  const [creatures, setCreatures] = useState("");
  if (rulesetKey !== "dnd-5e-2024" || version !== "5.2.1")
    return <p>Encounter budgets are not available for this ruleset version yet.</p>;
  const parts = creatures.split(/[,\n]/).map(part => part.trim()).filter(Boolean);
  const validXp = parts.every(part => /^\d+$/.test(part));
  let result: ReturnType<typeof calculateEncounterBudget> | null = null;
  let error = "";
  if (!validXp) error = "Enter whole XP values, separated by commas or lines.";
  else try {
    result = calculateEncounterBudget({ rulesetKey, version, partyLevel, partySize,
      creatureXp: parts.map(Number) });
  } catch (cause) {
    if (cause instanceof InvalidEncounterBudgetInputError) error = "Choose a level from 1 to 20, a party size from 1 to 20, and valid XP values.";
    else if (cause instanceof UnsupportedEncounterRulesetError) error = "This ruleset version is not supported.";
    else throw cause;
  }
  const display = (value: number) => value.toLocaleString("en-US");
  return <section aria-labelledby="encounter-budget-heading">
    <h3 id="encounter-budget-heading">Encounter XP budget</h3>
    <p>Estimate a combat encounter for characters of the same level. Enter each creature&apos;s XP from its stat block; repeated creatures need repeated values. This calculation does not save an encounter.</p>
    <label htmlFor="encounter-party-level">Party level</label>
    <input id="encounter-party-level" type="number" min="1" max="20" value={partyLevel}
      onChange={event => setPartyLevel(Number(event.target.value))} />
    <label htmlFor="encounter-party-size">Number of characters</label>
    <input id="encounter-party-size" type="number" min="1" max="20" value={partySize}
      onChange={event => setPartySize(Number(event.target.value))} />
    <label htmlFor="encounter-creature-xp">Creature XP values (optional)</label>
    <textarea id="encounter-creature-xp" value={creatures} rows={3}
      onChange={event => setCreatures(event.target.value)} placeholder="200, 100, 100" />
    {error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite">
      <p>XP budgets for {partySize} level {partyLevel} character{partySize === 1 ? "" : "s"}:</p>
      <ul><li>Low: {display(result.budgets.low)} XP</li>
        <li>Moderate: {display(result.budgets.moderate)} XP</li>
        <li>High: {display(result.budgets.high)} XP</li></ul>
      {parts.length > 0 && <p>Creature total: {display(result.totalXp)} XP.
        {result.totalXp > result.budgets.high ? " Above the high budget."
          : result.totalXp > result.budgets.moderate ? " Within the high budget."
          : result.totalXp > result.budgets.low ? " Within the moderate budget."
          : " Within the low budget."}</p>}
    </div>}
  </section>;
}

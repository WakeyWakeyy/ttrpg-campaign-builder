import { expect, test } from "vitest";
import { calculateEncounterBudget, InvalidEncounterBudgetInputError,
  UnsupportedEncounterRulesetError } from "../../src/modules/rulesets/encounter-budget";

const base = { rulesetKey: "dnd-5e-2024", version: "5.2.1", partyLevel: 1, partySize: 4,
  creatureXp: [] as number[] };

test("matches the SRD encounter examples at low, moderate, and high budgets", () => {
  expect(calculateEncounterBudget({ ...base, creatureXp: [200] })).toEqual({
    budgets: { low: 200, moderate: 300, high: 400 }, totalXp: 200,
  });
  expect(calculateEncounterBudget({ ...base, partyLevel: 3, partySize: 5,
    creatureXp: [450, 450, ...Array(9).fill(25)] })).toEqual({
    budgets: { low: 750, moderate: 1125, high: 2000 }, totalXp: 1125,
  });
  expect(calculateEncounterBudget({ ...base, partyLevel: 15, partySize: 6,
    creatureXp: [18000, 18000, 5000, 5000] })).toEqual({
    budgets: { low: 19800, moderate: 32400, high: 46800 }, totalXp: 46000,
  });
  expect(calculateEncounterBudget({ ...base, partyLevel: 20, partySize: 1 })).toMatchObject({
    budgets: { low: 6400, moderate: 13200, high: 22000 },
  });
});

test("rejects unsupported versions and invalid levels, party sizes, or XP", () => {
  expect(() => calculateEncounterBudget({ ...base, version: "5.1" }))
    .toThrow(UnsupportedEncounterRulesetError);
  for (const input of [
    { ...base, partyLevel: 0 }, { ...base, partyLevel: 21 }, { ...base, partyLevel: 2.5 },
    { ...base, partySize: 0 }, { ...base, creatureXp: [-1] },
    { ...base, creatureXp: [1.5] }, { ...base, creatureXp: [Number.MAX_SAFE_INTEGER, 1] },
  ]) expect(() => calculateEncounterBudget(input)).toThrow(InvalidEncounterBudgetInputError);
});

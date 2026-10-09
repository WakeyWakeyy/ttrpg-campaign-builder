/** SRD 5.2.1, Combat Encounters, printed page 202. Values are XP per character. */
const XP_BUDGETS = [
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500],
  [500, 750, 1100], [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100],
  [1300, 2000, 2600], [1600, 2300, 3100], [1900, 2900, 4100], [2200, 3700, 4700],
  [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800], [3800, 6100, 9800],
  [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
] as const;

export class InvalidEncounterBudgetInputError extends Error {}
export class UnsupportedEncounterRulesetError extends Error {}

export type EncounterBudgetInput = {
  rulesetKey: string;
  version: string;
  partyLevel: number;
  partySize: number;
  creatureXp: number[];
};

export function calculateEncounterBudget(input: EncounterBudgetInput) {
  if (input.rulesetKey !== "dnd-5e-2024" || input.version !== "5.2.1")
    throw new UnsupportedEncounterRulesetError();
  if (!Number.isInteger(input.partyLevel) || input.partyLevel < 1 || input.partyLevel > 20
    || !Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > 20
    || !Array.isArray(input.creatureXp) || input.creatureXp.length > 100
    || input.creatureXp.some(xp => !Number.isSafeInteger(xp) || xp < 0))
    throw new InvalidEncounterBudgetInputError();
  const totalXp = input.creatureXp.reduce((sum, xp) => sum + xp, 0);
  if (!Number.isSafeInteger(totalXp)) throw new InvalidEncounterBudgetInputError();
  const [low, moderate, high] = XP_BUDGETS[input.partyLevel - 1];
  return {
    budgets: { low: low * input.partySize, moderate: moderate * input.partySize,
      high: high * input.partySize },
    totalXp,
  };
}

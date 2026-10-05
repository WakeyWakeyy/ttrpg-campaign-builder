export class CampaignNotFoundError extends Error {
  readonly code = "CAMPAIGN_NOT_FOUND";

  constructor() {
    super("Campaign not found.");
    this.name = "CampaignNotFoundError";
  }
}

export class RulesetVersionNotFoundError extends Error {
  readonly code = "RULESET_VERSION_NOT_FOUND";

  constructor() {
    super("Ruleset Version not found.");
    this.name = "RulesetVersionNotFoundError";
  }
}

export class InvalidCampaignInputError extends Error {
  readonly code = "INVALID_CAMPAIGN_INPUT";

  constructor(readonly field: "name" | "originalPremise") {
    super(`${field} must be nonblank text.`);
    this.name = "InvalidCampaignInputError";
  }
}

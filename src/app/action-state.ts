import { CampaignNotFoundError, CompassRevisionConflictError, InvalidCampaignInputError, RulesetVersionNotFoundError } from "@/modules/campaigns";
import { BlueprintAlreadyMaterializedError, BlueprintIdempotencyConflictError, BlueprintNotFoundError, BlueprintReviewLockedError, BlueprintRevisionConflictError, InvalidBlueprintInputError } from "@/modules/blueprints";
import { UnauthenticatedError } from "@/modules/identity";
import { InvalidLocationInputError, InvalidLocationParentError, LocationNotFoundError, LocationRevisionConflictError } from "@/modules/locations";
import { ArcNotFoundError, ArcRevisionConflictError, InvalidArcInputError } from "@/modules/arcs";

export type ActionState = { message: string; conflict?: boolean };
export function actionError(error: unknown): ActionState {
  if (error instanceof ArcRevisionConflictError) return { message: "This arc changed since you opened it. Reload before saving again.", conflict: true };
  if (error instanceof ArcNotFoundError) return { message: "Arc not found or unavailable." };
  if (error instanceof InvalidArcInputError) return { message: "Enter an arc name and check its description. If this continues, reload the page." };
  if (error instanceof BlueprintRevisionConflictError) return { message: "This draft changed since you opened it. Reload before saving again.", conflict: true };
  if (error instanceof BlueprintNotFoundError) return { message: "Draft not found or unavailable." };
  if (error instanceof BlueprintReviewLockedError) return { message: "Location proposals are now edited in Review. Reload this draft before saving again.", conflict: true };
  if (error instanceof BlueprintAlreadyMaterializedError) return { message: "This draft has already created a campaign. Reload to open it.", conflict: true };
  if (error instanceof BlueprintIdempotencyConflictError) return { message: "This request key belongs to a different or unfinished operation. Reload before trying again.", conflict: true };
  if (error instanceof InvalidBlueprintInputError) return { message: "Enter a title and premise, with at most 20 proposed locations." };
  if (error instanceof CompassRevisionConflictError) return { message: "This compass changed since you opened it. Reload before saving again.", conflict: true };
  if (error instanceof LocationRevisionConflictError) return { message: "This location changed since you opened it. Reload before saving again.", conflict: true };
  if (error instanceof UnauthenticatedError) return { message: "Please sign in again before continuing." };
  if (error instanceof CampaignNotFoundError) return { message: "Campaign not found or unavailable." };
  if (error instanceof LocationNotFoundError) return { message: "Location not found or unavailable." };
  if (error instanceof RulesetVersionNotFoundError) return { message: "Campaign creation is temporarily unavailable. Please try again later." };
  if (error instanceof InvalidCampaignInputError) return { message: error.field === "currentPremise" ? "Enter a current premise and reload if this continues." : "Enter a name and original premise." };
  if (error instanceof InvalidLocationInputError) return { message: "Check the location fields. A name is required. If this continues, reload the page." };
  if (error instanceof InvalidLocationParentError) return { message: "That parent location is unavailable." };
  return { message: "Unable to complete this request. Please try again later." };
}

import { CampaignNotFoundError, CompassRevisionConflictError, InvalidCampaignInputError, RulesetVersionNotFoundError } from "@/modules/campaigns";
import { UnauthenticatedError } from "@/modules/identity";
import { InvalidLocationInputError, InvalidLocationParentError, LocationNotFoundError, LocationRevisionConflictError } from "@/modules/locations";

export type ActionState = { message: string; conflict?: boolean };
export function actionError(error: unknown): ActionState {
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

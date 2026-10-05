import { notFound, redirect } from "next/navigation";
import { CampaignNotFoundError } from "@/modules/campaigns";
import { LocationNotFoundError } from "@/modules/locations";
import { UnauthenticatedError } from "@/modules/identity";

export function readError(error: unknown): never {
  if (error instanceof UnauthenticatedError) redirect("/");
  if (error instanceof CampaignNotFoundError || error instanceof LocationNotFoundError) notFound();
  throw error;
}

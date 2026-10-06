import { notFound, redirect } from "next/navigation";
import { CampaignNotFoundError } from "@/modules/campaigns";
import { LocationNotFoundError } from "@/modules/locations";
import { ArcNotFoundError } from "@/modules/arcs";
import { NpcNotFoundError } from "@/modules/npcs";
import { QuestNotFoundError } from "@/modules/quests";
import { UnauthenticatedError } from "@/modules/identity";

export function readError(error: unknown): never {
  if (error instanceof UnauthenticatedError) redirect("/");
  if (error instanceof CampaignNotFoundError || error instanceof LocationNotFoundError || error instanceof ArcNotFoundError || error instanceof QuestNotFoundError || error instanceof NpcNotFoundError) notFound();
  throw error;
}

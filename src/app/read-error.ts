import { notFound, redirect } from "next/navigation";
import { CampaignNotFoundError } from "@/modules/campaigns";
import { LocationNotFoundError } from "@/modules/locations";
import { ArcNotFoundError } from "@/modules/arcs";
import { NpcNotFoundError } from "@/modules/npcs";
import { QuestNotFoundError } from "@/modules/quests";
import { PlayerCharacterNotFoundError } from "@/modules/player-characters";
import { PartyNotFoundError } from "@/modules/parties";
import { FactionNotFoundError } from "@/modules/factions";
import { UnauthenticatedError } from "@/modules/identity";

export function readError(error: unknown): never {
  if (error instanceof UnauthenticatedError) redirect("/");
  if (error instanceof CampaignNotFoundError || error instanceof LocationNotFoundError || error instanceof ArcNotFoundError || error instanceof QuestNotFoundError || error instanceof NpcNotFoundError || error instanceof PlayerCharacterNotFoundError || error instanceof PartyNotFoundError || error instanceof FactionNotFoundError) notFound();
  throw error;
}

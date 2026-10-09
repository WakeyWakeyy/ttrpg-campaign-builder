import { notFound, redirect } from "next/navigation";
import { CampaignNotFoundError } from "@/modules/campaigns";
import { LocationNotFoundError } from "@/modules/locations";
import { ArcNotFoundError } from "@/modules/arcs";
import { NpcNotFoundError } from "@/modules/npcs";
import { QuestNotFoundError } from "@/modules/quests";
import { PlayerCharacterNotFoundError } from "@/modules/player-characters";
import { PartyNotFoundError } from "@/modules/parties";
import { FactionNotFoundError } from "@/modules/factions";
import { TravelRouteNotFoundError } from "@/modules/travel-routes";
import { ItemNotFoundError } from "@/modules/items";
import { RelationshipNotFoundError } from "@/modules/relationships";
import { TimelineEventNotFoundError } from "@/modules/timeline";
import { SessionNotFoundError } from "@/modules/sessions";
import { EncounterNotFoundError } from "@/modules/encounters";
import { RewardNotFoundError } from "@/modules/rewards";
import { UnauthenticatedError } from "@/modules/identity";

export function readError(error: unknown): never {
  if (error instanceof UnauthenticatedError) redirect("/");
  if (error instanceof CampaignNotFoundError || error instanceof LocationNotFoundError || error instanceof ArcNotFoundError || error instanceof QuestNotFoundError || error instanceof NpcNotFoundError || error instanceof PlayerCharacterNotFoundError || error instanceof PartyNotFoundError || error instanceof FactionNotFoundError || error instanceof TravelRouteNotFoundError || error instanceof ItemNotFoundError || error instanceof RelationshipNotFoundError || error instanceof TimelineEventNotFoundError || error instanceof SessionNotFoundError || error instanceof EncounterNotFoundError || error instanceof RewardNotFoundError) notFound();
  throw error;
}

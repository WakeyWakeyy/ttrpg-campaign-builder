import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedCampaign } from "@/modules/campaigns";
import { listCampaignOutcomeScenes, listOwnedSessions } from "@/modules/sessions";
import { summarizeSessionOutcomes } from "@/modules/intelligence/session-summary";
import { readError } from "../../../read-error";

export default async function CampaignSummaryPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const data = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const campaign = await getOwnedCampaign(db, actor, campaignId);
    const sessions = await listOwnedSessions(db, actor, campaignId);
    const scenes = await listCampaignOutcomeScenes(db, actor, campaignId);
    const summary = summarizeSessionOutcomes(sessions, scenes);
    return { campaign, summary };
  })().catch(readError);

  return <main className="workspace-page">
    <Link href={`/campaigns/${campaignId}`}>Back to {data.campaign.name}</Link>
    <div className="workspace-heading"><div>
      <p className="workspace-eyebrow">Campaign summary</p>
      <h1>What happened in {data.campaign.name}</h1>
      <p>Recorded session and scene outcomes, in the GM&apos;s words. Open a source to review or edit it.</p>
    </div></div>
    {data.summary.length ? <ol>{data.summary.map(item => <li key={item.sessionId} className="workspace-section">
      <h2><Link href={`/sessions/${item.sessionId}`}>{item.title}</Link></h2>
      {item.plannedFor && <p>Planned for {item.plannedFor}</p>}
      {item.outcome && <p className="preserve-lines">{item.outcome}</p>}
      {item.scenes.length > 0 && <ul>{item.scenes.map(scene => <li key={scene.id}>
        <Link href={`/sessions/${item.sessionId}`}>{scene.title}</Link>: <span className="preserve-lines">{scene.outcome}</span>
      </li>)}</ul>}
    </li>)}</ol> : <p>No recorded session or scene outcomes yet.</p>}
  </main>;
}

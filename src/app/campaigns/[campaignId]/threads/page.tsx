import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { getOwnedCampaign } from "@/modules/campaigns";
import { listOwnedQuests } from "@/modules/quests";
import { reviewThreads, type ThreadReviewItem } from "@/modules/intelligence/thread-review";
import { readError } from "../../../read-error";

function ThreadGroup({ title, items }: { title: string; items: ThreadReviewItem[] }) {
  return <section className="workspace-section">
    <h2>{title} ({items.length})</h2>
    {items.length ? <ul>{items.map(item => <li key={item.id}>
      <Link href={`/quests/${item.id}`}>{item.name}</Link>{item.parentName && <> · under {item.parentName}</>}
    </li>)}</ul> : <p>None recorded.</p>}
  </section>;
}

export default async function ThreadReviewPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const data = await (async () => {
    const db = getDatabase();
    const actor = await requireActor(db);
    const campaign = await getOwnedCampaign(db, actor, campaignId);
    const quests = await listOwnedQuests(db, actor, campaignId);
    return { campaign, review: reviewThreads(quests) };
  })().catch(readError);

  return <main className="workspace-page">
    <Link href={`/campaigns/${campaignId}`}>Back to {data.campaign.name}</Link>
    <div className="workspace-heading"><div>
      <p className="workspace-eyebrow">Campaign threads</p>
      <h1>Threads in {data.campaign.name}</h1>
      <p>Review open, postponed, and abandoned Quests in one place. These are recorded states, not judgments about what should happen next.</p>
    </div></div>
    <ThreadGroup title="Open" items={data.review.open} />
    <ThreadGroup title="Postponed" items={data.review.postponed} />
    <ThreadGroup title="Abandoned" items={data.review.abandoned} />
  </main>;
}

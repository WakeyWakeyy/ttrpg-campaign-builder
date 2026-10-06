import { SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { listOwnedCampaigns } from "@/modules/campaigns";
import { listOwnedBlueprints } from "@/modules/blueprints";
import { ActionForm } from "./action-form";
import { createBlueprintAction, createCampaignAction } from "./actions";
import { CampaignWizard } from "./campaign-wizard";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) return <main>
    <h1>TTRPG Campaign Builder</h1>
    <p>Organize your campaigns and locations.</p>
    <SignInButton mode="modal"><button>Sign in to your campaigns</button></SignInButton>
  </main>;
  const db = getDatabase();
  const actor = await requireActor(db);
  const [campaigns, drafts] = await Promise.all([listOwnedCampaigns(db, actor), listOwnedBlueprints(db, actor)]);
  const active = campaigns.filter(campaign => !campaign.deletedAt && !campaign.archivedAt);
  const archived = campaigns.filter(campaign => !campaign.deletedAt && campaign.archivedAt);
  const trashed = campaigns.filter(campaign => campaign.deletedAt);
  const campaignList = (items: typeof campaigns) => <ul>{items.map(campaign => <li key={campaign.id}>
    <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
    {campaign.description && <p>{campaign.description}</p>}
  </li>)}</ul>;
  return <main>
    <h1>Your campaigns</h1>
    <p>Pick up a campaign or start with a new idea.</p>
    <section aria-labelledby="active-campaigns">
      <h2 id="active-campaigns">Active campaigns</h2>
      {active.length ? campaignList(active) : <p>No active campaigns yet.</p>}
    </section>
    {archived.length > 0 && <section aria-labelledby="archived-campaigns">
      <h2 id="archived-campaigns">Archived campaigns</h2>{campaignList(archived)}
    </section>}
    {trashed.length > 0 && <section aria-labelledby="trashed-campaigns">
      <h2 id="trashed-campaigns">In trash</h2>{campaignList(trashed)}
    </section>}
    <section aria-labelledby="blueprint-drafts">
      <h2 id="blueprint-drafts">Blueprint drafts</h2>
      <p>Develop an idea before adding anything to a campaign.</p>
      {drafts.length ? <ul>{drafts.map(draft => <li key={draft.id}><Link href={`/blueprints/${draft.id}`}>{draft.title}</Link></li>)}</ul> : <p>No drafts yet.</p>}
      <details>
        <summary>Start a blueprint draft</summary>
        <ActionForm action={createBlueprintAction}>
          <label htmlFor="draft-title">Title</label><input id="draft-title" name="title" required />
          <label htmlFor="draft-premise">Premise</label><textarea id="draft-premise" name="premise" rows={4} required />
          <label htmlFor="draft-setting">Setting (optional)</label><input id="draft-setting" name="setting" />
          <label htmlFor="draft-tone">Tone (optional)</label><input id="draft-tone" name="tone" />
          <label htmlFor="draft-locations">Proposed locations (one per line, optional)</label><textarea id="draft-locations" name="proposedLocations" rows={4} />
          <button type="submit">Save draft</button>
        </ActionForm>
      </details>
    </section>
    <section aria-labelledby="create-campaign-heading">
    <h2 id="create-campaign-heading">Create campaign</h2>
    <p>Start with the idea you want to preserve. You can add more context now or later.</p>
    <ActionForm action={createCampaignAction}>
      <label htmlFor="name">Name</label><input id="name" name="name" required />
      <label htmlFor="originalPremise">Original premise</label><textarea id="originalPremise" name="originalPremise" rows={5} required />
      <label htmlFor="description">Short description (optional)</label><textarea id="description" name="description" rows={2} />
      <label htmlFor="setting">Setting (optional)</label><input id="setting" name="setting" />
      <label htmlFor="tone">Tone (optional)</label><input id="tone" name="tone" />
      <label htmlFor="originalNotes">Original notes (optional)</label><textarea id="originalNotes" name="originalNotes" rows={4} />
      <button type="submit">Create campaign</button>
    </ActionForm>
    </section>
    <details>
      <summary>Create with a guided wizard</summary>
      <p>Build the same campaign in three short steps, then review it before saving.</p>
      <CampaignWizard />
    </details>
  </main>;
}

import { SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { listOwnedCampaigns } from "@/modules/campaigns";
import { ActionForm } from "./action-form";
import { createCampaignAction } from "./actions";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) return <main>
    <h1>TTRPG Campaign Builder</h1>
    <p>Organize your campaigns and locations.</p>
    <SignInButton mode="modal"><button>Sign in to your campaigns</button></SignInButton>
  </main>;
  const db = getDatabase();
  const campaigns = await listOwnedCampaigns(db, await requireActor(db));
  return <main>
    <h1>Your campaigns</h1>
    {campaigns.length ? <ul>{campaigns.map(campaign => <li key={campaign.id}>
      <Link href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>
    </li>)}</ul> : <p>No campaigns yet.</p>}
    <h2>Create campaign</h2>
    <ActionForm action={createCampaignAction}>
      <label htmlFor="name">Name</label><input id="name" name="name" required />
      <label htmlFor="originalPremise">Original premise</label><textarea id="originalPremise" name="originalPremise" rows={5} required />
      <button type="submit">Create campaign</button>
    </ActionForm>
  </main>;
}

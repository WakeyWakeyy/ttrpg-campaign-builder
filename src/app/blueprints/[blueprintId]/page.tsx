import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { BlueprintNotFoundError, getOwnedBlueprint } from "@/modules/blueprints";
import { ActionForm } from "../../action-form";
import { editBlueprintAction, startBlueprintReviewAction } from "../../actions";

export default async function BlueprintPage({ params }: { params: Promise<{ blueprintId: string }> }) {
  const { blueprintId } = await params;
  const db = getDatabase();
  const actor = await requireActor(db);
  let draft;
  try { draft = await getOwnedBlueprint(db, actor, blueprintId); }
  catch (error) { if (error instanceof BlueprintNotFoundError) notFound(); throw error; }
  return <main>
    <Link href="/">All campaigns and drafts</Link>
    <h1>{draft.title}</h1>
    <p>This is a private proposal. Saving it does not change a campaign.</p>
    <ActionForm action={editBlueprintAction.bind(null, draft.id)} reloadLabel="Reload draft">
      <input type="hidden" name="expectedRevision" value={draft.revision} />
      <label htmlFor="title">Title</label><input id="title" name="title" defaultValue={draft.title} required />
      <label htmlFor="premise">Premise</label><textarea id="premise" name="premise" rows={5} defaultValue={draft.premise} required />
      <label htmlFor="setting">Setting (optional)</label><input id="setting" name="setting" defaultValue={draft.setting ?? ""} />
      <label htmlFor="tone">Tone (optional)</label><input id="tone" name="tone" defaultValue={draft.tone ?? ""} />
      {draft.reviewStartedAt ? <>
        <input type="hidden" name="proposedLocations" value={draft.proposedLocations.join("\n")} />
        <p>Location proposals are managed in <Link href={`/blueprints/${draft.id}/review`}>Blueprint Review</Link>.</p>
      </> : <>
        <label htmlFor="proposedLocations">Proposed locations (one per line, optional)</label>
        <textarea id="proposedLocations" name="proposedLocations" rows={5} defaultValue={draft.proposedLocations.join("\n")} />
      </>}
      <button type="submit">Save draft changes</button>
    </ActionForm>
    {!draft.reviewStartedAt && <ActionForm action={startBlueprintReviewAction.bind(null, draft.id)} reloadLabel="Reload draft">
      <input type="hidden" name="expectedRevision" value={draft.revision} />
      <button type="submit">Start Blueprint Review</button>
    </ActionForm>}
  </main>;
}

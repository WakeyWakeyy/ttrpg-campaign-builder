import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { CampaignNotFoundError } from "@/modules/campaigns";
import { UnauthenticatedError } from "@/modules/identity";
import { buildCampaignExport, renderCampaignMarkdown } from "@/modules/export";
import { renderCampaignOverview } from "@/modules/export/campaign-overview";
import { renderCampaignQuickReference } from "@/modules/export/campaign-quick-reference";
import { renderCampaignModule } from "@/modules/export/campaign-module";

export async function GET(request: Request, { params }: { params: Promise<{ campaignId: string; format: string }> }) {
  const { campaignId, format } = await params;
  if (!["json", "md", "overview", "module", "quick-reference", "pdf"].includes(format)) return new Response("Not found", { status: 404 });
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const snapshot = await buildCampaignExport(db, actor, campaignId);
    const content = format === "pdf" ? await (await import("@/modules/export/campaign-pdf")).renderCampaignPdf(snapshot)
      : format === "json" ? JSON.stringify(snapshot, null, 2) + "\n"
      : format === "quick-reference" ? renderCampaignQuickReference(snapshot, new URL(request.url).origin)
      : format === "module" ? renderCampaignModule(snapshot)
      : format === "overview" ? renderCampaignOverview(snapshot, new URL(request.url).origin) : renderCampaignMarkdown(snapshot);
    const extension = format === "pdf" ? "pdf" : format === "json" ? "json" : "md";
    return new Response(content, { headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaign-${campaignId}${format === "overview" || format === "module" || format === "quick-reference" ? `-${format}` : ""}.${extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response("Authentication required", { status: 401 });
    if (error instanceof CampaignNotFoundError) return new Response("Not found", { status: 404 });
    throw error;
  }
}

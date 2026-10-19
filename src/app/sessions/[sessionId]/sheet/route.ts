import { requireActor } from "@/infrastructure/auth/clerk/require-actor";
import { getDatabase } from "@/infrastructure/db/server";
import { buildSessionSheet, renderSessionSheet } from "@/modules/export/session-sheet";
import { UnauthenticatedError } from "@/modules/identity";
import { SessionNotFoundError } from "@/modules/sessions";

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "md";
  if (format !== "md" && format !== "pdf") return new Response("Not found", { status: 404 });
  try {
    const db = getDatabase();
    const actor = await requireActor(db);
    const sheet = await buildSessionSheet(db, actor, sessionId);
    const content = format === "pdf" ? await (await import("@/modules/export/session-sheet-pdf")).renderSessionSheetPdf(sheet) : renderSessionSheet(sheet);
    return new Response(content, { headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="session-${sessionId}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response("Authentication required", { status: 401 });
    if (error instanceof SessionNotFoundError) return new Response("Not found", { status: 404 });
    throw error;
  }
}

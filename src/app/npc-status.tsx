export function NpcStatus({ npc }: { npc: { deletedAt: Date | null; archivedAt: Date | null } }) {
  return <span className="status">{npc.deletedAt ? "Trashed" : npc.archivedAt ? "Archived" : "Active"}</span>;
}

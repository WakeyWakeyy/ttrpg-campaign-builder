export function ArcStatus({ arc }: { arc: { deletedAt: Date | null; archivedAt: Date | null } }) {
  return <span className="status">{arc.deletedAt ? "Trashed" : arc.archivedAt ? "Archived" : "Active"}</span>;
}

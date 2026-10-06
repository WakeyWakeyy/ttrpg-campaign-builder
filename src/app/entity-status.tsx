export function EntityStatus({ entity }: { entity: { deletedAt: Date | null; archivedAt: Date | null } }) {
  return <span className="status">{entity.deletedAt ? "Trashed" : entity.archivedAt ? "Archived" : "Active"}</span>;
}

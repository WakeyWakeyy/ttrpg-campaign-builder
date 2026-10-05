export function LocationStatus({ location }: { location: { deletedAt: Date | null; archivedAt: Date | null } }) {
  return <span className="status">{location.deletedAt ? "Trashed" : location.archivedAt ? "Archived" : "Active"}</span>;
}

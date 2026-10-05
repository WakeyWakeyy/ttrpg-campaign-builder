/** The authenticated application identity. userId is always user_account.id. */
export type Actor = Readonly<{ userId: string }>;

export class UnauthenticatedError extends Error {
  readonly code = "UNAUTHENTICATED";

  constructor() {
    super("Authentication is required.");
    this.name = "UnauthenticatedError";
  }
}

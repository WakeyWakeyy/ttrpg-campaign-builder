export function requestError(error: unknown): unknown {
  // Database and provider errors can contain query parameters or private content.
  return process.env.NODE_ENV === "production" ? new Error("Unable to complete the request.") : error;
}

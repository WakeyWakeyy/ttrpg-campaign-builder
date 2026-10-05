export class LocationNotFoundError extends Error {
  readonly code = "LOCATION_NOT_FOUND";
  constructor() { super("Location not found."); this.name = "LocationNotFoundError"; }
}

export class InvalidLocationInputError extends Error {
  readonly code = "INVALID_LOCATION_INPUT";
  constructor(readonly field: string) {
    super(`Invalid Location ${field}.`); this.name = "InvalidLocationInputError";
  }
}

export class LocationRevisionConflictError extends Error {
  readonly code = "LOCATION_REVISION_CONFLICT";
  constructor() { super("Location revision conflict."); this.name = "LocationRevisionConflictError"; }
}

export class InvalidLocationParentError extends Error {
  readonly code = "INVALID_LOCATION_PARENT";
  constructor() { super("Invalid Location parent."); this.name = "InvalidLocationParentError"; }
}

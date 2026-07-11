export class SepbaseError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SepbaseError";
  }
}

export class NotDeployedError extends SepbaseError {
  constructor() {
    super("The name-service contract has not been deployed for this manifest.", "NOT_DEPLOYED", 503);
    this.name = "NotDeployedError";
  }
}

export class InvalidInputError extends SepbaseError {
  constructor(message: string) {
    super(message, "INVALID_INPUT", 400);
    this.name = "InvalidInputError";
  }
}

export class RpcUnavailableError extends SepbaseError {
  constructor(message = "The configured RPC could not complete the request.") {
    super(message, "RPC_UNAVAILABLE", 503);
    this.name = "RpcUnavailableError";
  }
}

export class ManifestMismatchError extends SepbaseError {
  constructor(message: string) {
    super(message, "MANIFEST_MISMATCH");
    this.name = "ManifestMismatchError";
  }
}

export class UnsupportedSchemaError extends SepbaseError {
  constructor(schemaVersion: unknown) {
    super(`Unsupported manifest schema version: ${String(schemaVersion)}.`, "UNSUPPORTED_SCHEMA");
    this.name = "UnsupportedSchemaError";
  }
}

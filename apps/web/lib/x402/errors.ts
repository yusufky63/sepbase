export class X402RegistrationError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "X402RegistrationError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isX402RegistrationError(error: unknown): error is X402RegistrationError {
  return error instanceof X402RegistrationError;
}

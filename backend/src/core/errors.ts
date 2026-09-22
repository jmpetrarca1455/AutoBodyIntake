/**
 * Typed application errors with a consistent shape across the whole API.
 * As the surface grows (payments, dashboards, adjuster tooling…), every
 * module throws these instead of ad-hoc reply.code(...) calls, so error
 * responses stay uniform and easy to reason about from day one.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request') {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflicting state') {
    super(message, 409, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'An upstream service failed') {
    super(message, 502, 'UPSTREAM_ERROR');
    this.name = 'UpstreamError';
  }
}


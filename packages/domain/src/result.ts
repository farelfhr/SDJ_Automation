/**
 * Result Types
 *
 * Functional error handling with Result type.
 */

/**
 * Success result
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Failure result
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Result type - either success or failure
 */
export type Result<T, E = Error> = Ok<T> | Err<E>;

/**
 * Create success result
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true as const, value };
}

/**
 * Create failure result
 */
export function err<E>(error: E): Err<E> {
  return { ok: false as const, error };
}

/**
 * Check if result is success
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Check if result is failure
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

/**
 * Unwrap value or throw
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isErr(result)) {
    throw result.error;
  }
  return result.value;
}

/**
 * Unwrap or provide default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isErr(result)) {
    return defaultValue;
  }
  return result.value;
}

/**
 * Map over the value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (isErr(result)) {
    return result;
  }
  return ok(fn(result.value));
}

/**
 * Map over the error
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain operations
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (isErr(result)) {
    return result;
  }
  return fn(result.value);
}

/**
 * Async version of ok
 */
export async function okAsync<T>(value: T): Promise<Ok<T>> {
  return { ok: true as const, value };
}

/**
 * Async version of err
 */
export async function errAsync<E>(error: E): Promise<Err<E>> {
  return { ok: false as const, error };
}

/**
 * Async map
 */
export async function mapAsync<T, U, E>(
  result: Promise<Result<T, E>>,
  fn: (value: T) => Promise<U>
): Promise<Result<U, E>> {
  const resolved = await result;
  if (isErr(resolved)) {
    return resolved;
  }
  return ok(await fn(resolved.value));
}

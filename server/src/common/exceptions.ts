import { HttpException } from '@nestjs/common';

/**
 * Throws an HttpException whose response body is `{ message, code? }` —
 * the exact shape the frontend's ApiError.detail expects. This is the
 * direct successor to the old mock engine's `err(status, message, code)`
 * helper; call sites that used to call `err(...)` should now `throw apiError(...)`.
 */
export function apiError(status: number, message: string, code?: string): never {
  throw new HttpException(code ? { message, code } : { message }, status);
}

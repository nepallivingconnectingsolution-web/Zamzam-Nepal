import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Normalises every thrown error into the shape the frontend already expects:
 *
 *   { message: string, code?: string }
 *
 * The frontend's `ApiError` (client/src/api/client.ts) reads `e.detail` as
 * this object — e.g. RegisterPage reads `e.detail.message`, the auth login
 * route looks for `e.detail.code === "PENDING_APPROVAL"`. Every domain
 * exception thrown anywhere in this codebase should be an `HttpException`
 * whose response body already matches this shape (see
 * `common/exceptions.ts`), and this filter is the single place that
 * guarantees the wire format stays consistent even for exceptions Nest
 * generates itself (validation errors, 404s on unknown routes, etc).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong. Please try again.';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // class-validator's ValidationPipe produces { message: string[] }.
        if (Array.isArray(b.message)) {
          message = b.message.join(' ');
        } else if (typeof b.message === 'string') {
          message = b.message;
        }
        if (typeof b.code === 'string') code = b.code;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error('Unknown exception thrown', JSON.stringify(exception));
    }

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${status}: ${message}`);
    }

    response.status(status).json(code ? { message, code } : { message });
  }
}

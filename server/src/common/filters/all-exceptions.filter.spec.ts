import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { AllExceptionsFilter } from './all-exceptions.filter';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

function makeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: 'GET', url: '/test' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter — Sentry reporting', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => jest.clearAllMocks());

  it('reports an unknown (non-HttpException) error to Sentry', () => {
    const { host } = makeHost();
    filter.catch(new Error('boom'), host);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  it('reports a 5xx HttpException to Sentry', () => {
    const { host } = makeHost();
    const err = new HttpException('server exploded', HttpStatus.INTERNAL_SERVER_ERROR);
    filter.catch(err, host);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('does NOT report a 4xx HttpException to Sentry (expected client errors, not bugs)', () => {
    const { host } = makeHost();
    const err = new HttpException('bad input', HttpStatus.BAD_REQUEST);
    filter.catch(err, host);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

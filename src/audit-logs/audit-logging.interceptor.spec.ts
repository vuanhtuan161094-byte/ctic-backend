import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

import { firstValueFrom, of, throwError } from 'rxjs';

import type { SecurityAuditService } from '../security/security-audit.service';
import { AuditLoggingInterceptor } from './audit-logging.interceptor';

function createContext(method: string) {
  const request = {
    method,
    originalUrl:
      '/audit-findings/customer/plan/11111111-1111-4111-8111-111111111111',
    baseUrl: '/audit-findings',
    route: {
      path: '/customer/plan/:auditPlanId',
    },
    params: {},
    ip: '127.0.0.1',
    requestId: 'request-1',
    user: {
      userId: '22222222-2222-4222-8222-222222222222',
    },
    get: jest.fn(() => 'jest'),
  };
  const response = {
    statusCode: 200,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

describe('AuditLoggingInterceptor denied GET policy', () => {
  let write: jest.Mock;
  let interceptor: AuditLoggingInterceptor;

  beforeEach(() => {
    write = jest.fn().mockResolvedValue(undefined);
    interceptor = new AuditLoggingInterceptor({
      write,
    } as unknown as SecurityAuditService);
  });

  it('does not log successful GET requests', async () => {
    const result = await firstValueFrom(
      interceptor.intercept(createContext('GET'), {
        handle: () => of({ ok: true }),
      } as CallHandler),
    );

    expect(result).toEqual({
      ok: true,
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('logs authenticated GET requests denied inside the handler', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(createContext('GET'), {
          handle: () => throwError(() => new ForbiddenException('Denied')),
        } as CallHandler),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failure',
        statusCode: 403,
        requestId: 'request-1',
        userId: '22222222-2222-4222-8222-222222222222',
      }),
    );
  });

  it('does not add audit noise for ordinary failed GET requests', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(createContext('GET'), {
          handle: () => throwError(() => new NotFoundException()),
        } as CallHandler),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(write).not.toHaveBeenCalled();
  });

  it('preserves successful mutation auditing', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(createContext('POST'), {
          handle: () =>
            of({
              id: '33333333-3333-4333-8333-333333333333',
            }),
        } as CallHandler),
      ),
    ).resolves.toEqual({
      id: '33333333-3333-4333-8333-333333333333',
    });
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'success',
        statusCode: 200,
      }),
    );
  });
});

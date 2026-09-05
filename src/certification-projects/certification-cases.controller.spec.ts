import { ForbiddenException } from '@nestjs/common';

import { CertificationCasesController } from './certification-cases.controller';

describe('CertificationCasesController authorization boundary', () => {
  const projection = {
    getWorkspace: jest.fn(),
    getActivity: jest.fn(),
  };
  const resourceAccess = {
    assertProjectAccess: jest.fn(),
  };
  const controller = new CertificationCasesController(
    projection as never,
    resourceAccess as never,
  );
  const request = (roles: string[], userId = 'user-1') =>
    ({
      user: { sub: userId, roles },
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    resourceAccess.assertProjectAccess.mockResolvedValue(undefined);
    projection.getWorkspace.mockResolvedValue({ contract_version: '2.0' });
    projection.getActivity.mockResolvedValue({ items: [] });
  });

  it.each([
    [['ADMIN'], 'broad access'],
    [['AUDITOR'], 'scoped access'],
  ])(
    'checks project access before returning workspace for %s',
    async (roles) => {
      await controller.workspace('project-1', request(roles));

      expect(resourceAccess.assertProjectAccess).toHaveBeenCalledWith(
        'project-1',
        { userId: 'user-1', roles },
      );
      expect(
        resourceAccess.assertProjectAccess.mock.invocationCallOrder[0],
      ).toBeLessThan(projection.getWorkspace.mock.invocationCallOrder[0]);
    },
  );

  it('keeps denied project access non-disclosing', async () => {
    resourceAccess.assertProjectAccess.mockRejectedValue(
      new ForbiddenException('Không có quyền truy cập'),
    );

    await expect(
      controller.workspace('project-denied', request(['AUDITOR'])),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(projection.getWorkspace).not.toHaveBeenCalled();
  });

  it('applies the same project boundary before activity projection', async () => {
    await controller.activity(
      'project-1',
      'cursor',
      '25',
      'surveillance_1',
      'WORK_ITEM,AUDIT_REPORT',
      request(['COORDINATOR']),
    );

    expect(resourceAccess.assertProjectAccess).toHaveBeenCalledTimes(1);
    expect(projection.getActivity).toHaveBeenCalledWith(
      'project-1',
      { userId: 'user-1', roles: ['COORDINATOR'] },
      {
        cursor: 'cursor',
        limit: 25,
        cycle: 'surveillance_1',
        types: ['WORK_ITEM', 'AUDIT_REPORT'],
      },
    );
  });
});

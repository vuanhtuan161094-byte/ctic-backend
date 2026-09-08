import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TechnicalReviewsController } from './technical-reviews.controller';
import { TechnicalReviewsService } from './technical-reviews.service';
import { projectTechnicalReviewWorkspace } from './technical-review-workspace.projection';
import type { ResourceAccessService } from '../security/resource-access.service';
import type { SecurityRequest } from '../security/security-request';
import type { AuditDocumentsService } from '../audit-documents/audit-documents.service';
import type { PrismaService } from '../prisma/prisma.service';

const fixture = () => ({
  plan: { id: 'plan', project_code: 'CASE', organization_name: 'Customer' },
  report: {
    id: 'report',
    report_code: 'REPORT',
    status: 'ready_for_technical_review',
    version_no: 1,
  },
  review: {
    id: 'review',
    reviewer_id: 'reviewer',
    status: 'pending',
    reviewer: {
      id: 'reviewer',
      full_name: 'Reviewer',
      email: 'private@example.invalid',
    },
    form_data: {
      internal_secret: 'hidden',
      review_items: [
        {
          document_key: 'report',
          status: 'accepted',
          files: [
            {
              id: 'file',
              original_name: 'Report.pdf',
              sha256: 'secret',
              storage_path: 'private',
            },
          ],
        },
      ],
      f11: {
        preliminary_criteria: [
          { key: 'one', result: 'yes', comment: 'Evidence' },
        ],
        recommendation: 'certification_recommended',
      },
    },
  },
  can_start: true,
  assignment_status: 'ASSIGNED',
  eligibility_errors: [] as string[],
  assignment_history: [
    {
      id: 'assignment',
      status: 'CURRENT',
      due_at: new Date('2026-09-12T12:00:00+07:00'),
      reviewer: {
        id: 'reviewer',
        full_name: 'Reviewer',
        email: 'private@example.invalid',
      },
    },
  ],
  document_history: [
    {
      id: 'f11-v1',
      original_name: 'F11.pdf',
      is_current: false,
      version_no: 1,
      storage_path: 'private',
      sha256: 'secret',
    },
  ],
  criteria: { preliminary: [], technical: [] },
});

describe('Technical Review nested read workspace', () => {
  const service = {
    getCaseWorkspace: jest.fn(),
    assertCanPerformReview: jest.fn(),
  };
  const access = { assertEntityAccess: jest.fn() };
  const controller = new TechnicalReviewsController(
    service as unknown as TechnicalReviewsService,
    {} as AuditDocumentsService,
    access as unknown as ResourceAccessService,
  );
  const request = (
    roles = ['TECHNICAL_REVIEWER'],
    permissions = ['technical_reviews.read', 'technical_reviews.perform'],
  ) =>
    ({ user: { userId: 'reviewer', roles, permissions } }) as SecurityRequest;
  beforeEach(() => {
    jest.resetAllMocks();
    service.getCaseWorkspace.mockResolvedValue(fixture());
    service.assertCanPerformReview.mockResolvedValue({});
    access.assertEntityAccess.mockResolvedValue(undefined);
  });
  it('authorizes the PLAN before loading/projecting any workspace', async () => {
    access.assertEntityAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.getCaseWorkspace('plan', 'case', undefined, request()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.getCaseWorkspace).not.toHaveBeenCalled();
  });
  it('assigned reviewer uses the existing assignment/independence guard', async () => {
    const result = await controller.getCaseWorkspace(
      'plan',
      'case',
      'review',
      request(),
    );
    expect(result.can_perform).toBe(true);
    expect(result.can_assign).toBe(false);
    expect(service.assertCanPerformReview).toHaveBeenCalledWith('review', {
      userId: 'reviewer',
      roles: ['TECHNICAL_REVIEWER'],
    });
  });
  it.each(['wrong assignment', 'independence conflict'])(
    'preserves authorized read-only access when the existing guard rejects %s',
    async (reason) => {
      service.assertCanPerformReview.mockRejectedValue(
        new BadRequestException(reason),
      );
      const result = await controller.getCaseWorkspace(
        'plan',
        'case',
        undefined,
        request(),
      );
      expect(result.can_perform).toBe(false);
      expect(JSON.stringify(result)).not.toContain(reason);
    },
  );
  it('does not treat ADMIN as assigned technical reviewer', async () => {
    const result = await controller.getCaseWorkspace(
      'plan',
      'case',
      undefined,
      request(['ADMIN']),
    );
    expect(result.can_perform).toBe(false);
    expect(service.assertCanPerformReview).not.toHaveBeenCalled();
  });
  it('read-only permission does not imply mutation authority', async () => {
    const result = await controller.getCaseWorkspace(
      'plan',
      'case',
      undefined,
      request(['TECHNICAL_REVIEWER'], ['technical_reviews.read']),
    );
    expect(result.can_perform).toBe(false);
    expect(service.assertCanPerformReview).not.toHaveBeenCalled();
  });
  it('rejects mismatched review identity without disclosing the current review', async () => {
    await expect(
      controller.getCaseWorkspace(
        'plan',
        'case',
        'unrelated-review',
        request(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.assertCanPerformReview).not.toHaveBeenCalled();
  });
  it('does not disguise infrastructure errors as read-only authority', async () => {
    service.assertCanPerformReview.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(
      controller.getCaseWorkspace('plan', 'case', undefined, request()),
    ).rejects.toThrow('database unavailable');
  });
  it('coordinator assignment requires permission and existing readiness', async () => {
    const actor = request(
      ['COORDINATOR'],
      ['technical_reviews.read', 'technical_review.assign'],
    );
    expect(
      (await controller.getCaseWorkspace('plan', 'case', undefined, actor))
        .can_assign,
    ).toBe(true);
    const source = fixture();
    source.can_start = false;
    source.eligibility_errors = ['Còn 1 NC chưa được đóng'];
    service.getCaseWorkspace.mockResolvedValue(source);
    const result = await controller.getCaseWorkspace(
      'plan',
      'case',
      undefined,
      actor,
    );
    expect(result.can_assign).toBe(false);
    expect(result.eligibility_errors).toEqual(source.eligibility_errors);
  });
  it('does not offer reassignment after work starts', async () => {
    const source = fixture();
    source.review.status = 'in_review';
    service.getCaseWorkspace.mockResolvedValue(source);
    expect(
      (
        await controller.getCaseWorkspace(
          'plan',
          'case',
          undefined,
          request(['COORDINATOR'], ['technical_review.assign']),
        )
      ).can_assign,
    ).toBe(false);
  });
  it('projects only explicit fields, preserves versions, and never mutates the source', () => {
    const source = fixture();
    const before = JSON.stringify(source);
    const result = projectTechnicalReviewWorkspace(source, 'case', {
      perform: false,
      assign: false,
    });
    const serialized = JSON.stringify(result);
    for (const secret of [
      'storage_path',
      'sha256',
      'internal_secret',
      'private@example.invalid',
    ])
      expect(serialized).not.toContain(secret);
    expect(result.document_history[0]).toMatchObject({
      id: 'f11-v1',
      version_no: 1,
      is_current: false,
      download_url: '/document-files/f11-v1/download',
    });
    expect(result.review?.form_data.review_items[0].files[0].id).toBe('file');
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe('Technical Review exact case/PLAN boundary', () => {
  it('rejects missing or wrong-case PLAN before the broad legacy read', async () => {
    const prisma = {
      audit_plans: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new TechnicalReviewsService(
      prisma as unknown as PrismaService,
    );
    const load = jest.spyOn(service, 'getWorkspaceByPlan');
    await expect(
      service.getCaseWorkspace('unrelated', 'case'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.audit_plans.findFirst).toHaveBeenCalledWith({
      where: { id: 'unrelated', project_id: 'case' },
      select: { id: true },
    });
    expect(load).not.toHaveBeenCalled();
  });
});

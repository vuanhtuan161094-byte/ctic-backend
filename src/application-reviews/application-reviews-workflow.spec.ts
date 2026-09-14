import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { ApplicationReviewsService } from './application-reviews.service';

const normalizedScope = {
    isic_code_id: 'isic-1', isic_code: '2220', isic_revision: '4', isic_title: 'Plastics',
    isic_nace_mapping_id: 'isic-nace-1', nace_code_id: 'nace-1', nace_code: '22.2',
    nace_title: 'Plastics', nace_iaf_mapping_id: 'nace-iaf-1', iaf_code: '14',
    iaf_name: 'Rubber and plastic products', management_system: 'QMS',
    scope_description: 'Manufacture of plastic products', is_primary: true,
};

const reviewer = {
    id: 'reviewer-1',
    username: 'reviewer',
    full_name: 'Example Reviewer',
    user_roles: [{ roles: { role_name: 'TECHNICAL_REVIEWER' } }],
};

const completePayload = {
    application_id: 'application-1',
    submission_action: 'SUBMIT' as const,
    result: 'ACCEPTED',
    reviewer_id: reviewer.id,
    conclusion: 'Eligible for certification review',
    manday_method: 'IAF_MD5' as const,
    base_mandays: 2,
    final_mandays: 2,
    stage1_mandays: 0.5,
    stage2_mandays: 1.5,
    industry_scopes: [{
        isic_code_id: 'isic-1', isic_code: '2220', isic_revision: '4', isic_title: 'Plastics',
        isic_nace_mapping_id: 'isic-nace-1', nace_code_id: 'nace-1', nace_code: '22.2',
        nace_title: 'Plastics', nace_iaf_mapping_id: 'nace-iaf-1', iaf_code: '14',
        iaf_name: 'Rubber and plastic products', management_system: 'QMS' as const,
        scope_description: 'Manufacture of plastic products', is_primary: true,
    }],
};

function createHarness() {
    const tx = {
        application_reviews: {
            upsert: jest.fn().mockResolvedValue({ id: 'review-1' }),
            update: jest.fn().mockResolvedValue({ id: 'review-1' }),
        },
        application_review_actions: { create: jest.fn().mockResolvedValue({}) },
        application_review_capability_snapshots: {
            aggregate: jest.fn().mockResolvedValue({ _max: { approval_version: null } }),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        certification_applications: { update: jest.fn().mockResolvedValue({}) },
        notifications: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
        application_reviews: { findUnique: jest.fn(), findMany: jest.fn() },
        certification_applications: { findUnique: jest.fn() },
        users: { findFirst: jest.fn().mockResolvedValue(reviewer) },
        experts: { findMany: jest.fn() },
        $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const capabilities = {
        evaluateReview: jest.fn(),
        snapshotData: jest.fn().mockReturnValue([{
            review_id: 'review-1', program_code: 'ISO_9001', program_name: 'ISO 9001',
            iaf_code: '14', result: 'CAPABLE', evaluated_by: reviewer.id, approval_version: 1,
        }]),
    };
    const audit = { write: jest.fn().mockResolvedValue(undefined) };
    const service = new ApplicationReviewsService(prisma as any, capabilities as any, audit as any);
    jest.spyOn(service as any, 'validateIndustryScopes').mockResolvedValue([normalizedScope]);
    return { tx, prisma, capabilities, audit, service };
}

function application(workflow?: string) {
    return {
        id: 'application-1', application_code: 'APP-1', standard_name: 'ISO 9001:2015',
        certification_scope: 'Manufacture of plastic products', declaration_accepted: true,
        application_reviews: workflow ? [{
            id: 'review-1', workflow_status: workflow, prepared_by_id: 'preparer-1', reviewer_id: reviewer.id,
        }] : [],
    };
}

function submittedReview(overrides: Record<string, unknown> = {}) {
    return {
        id: 'review-1', application_id: 'application-1', result: 'ACCEPTED',
        workflow_status: 'SUBMITTED', reviewer_id: reviewer.id, prepared_by_id: 'preparer-1',
        conclusion: 'Eligible', manday_method: 'IAF_MD5', base_mandays: 2,
        final_mandays: 2, stage1_mandays: 0.5, stage2_mandays: 1.5,
        users: { id: reviewer.id, username: reviewer.username, full_name: reviewer.full_name },
        certification_applications: {
            id: 'application-1', application_code: 'APP-1', declaration_accepted: true,
            standard_name: 'ISO 9001:2015', certification_scope: 'Manufacture of plastic products',
        },
        ...overrides,
    };
}

describe('ApplicationReviewsService one-reviewer workflow', () => {

    it('returns historical industry scope snapshots without revalidating current taxonomy', async () => {
        const { service, prisma } = createHarness();
        const historical = [{
            id: 'review-old',
            industry_scopes_json: JSON.stringify([normalizedScope]),
        }];
        prisma.application_reviews.findMany.mockResolvedValue(historical);
        const validate = (service as any).validateIndustryScopes as jest.Mock;
        await expect(service.findAll()).resolves.toBe(historical);
        expect(validate).not.toHaveBeenCalled();
    });

    it('persists EMS and OH&S risk selections so reopening the review does not lose them', async () => {
        const { service, prisma, tx } = createHarness();
        prisma.certification_applications.findUnique.mockResolvedValue(application());
        await service.create({
            application_id: 'application-1',
            submission_action: 'SAVE_DRAFT',
            result: 'ACCEPTED',
            ems_complexity: 'HIGH',
            ohsms_complexity: 'LOW',
        }, 'preparer-1');
        expect(tx.application_reviews.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({
                ems_complexity: 'HIGH',
                ohsms_complexity: 'LOW',
            }),
        }));
    });
    it('saves a DRAFT without requiring reviewer, classification or completed man-days', async () => {
        const { service, prisma, tx } = createHarness();
        prisma.certification_applications.findUnique.mockResolvedValue(application());
        await service.create({
            application_id: 'application-1', submission_action: 'SAVE_DRAFT', result: 'ACCEPTED',
        }, 'preparer-1');
        expect(tx.application_reviews.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({ workflow_status: 'DRAFT', reviewer_id: null }),
        }));
        expect(tx.application_review_actions.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ action: 'SAVE_DRAFT', to_status: 'DRAFT' }),
        });
    });

    it('submits a complete review to one reviewer without expert/auditor assignment dependency', async () => {
        const { service, prisma, tx } = createHarness();
        prisma.certification_applications.findUnique.mockResolvedValue(application());
        await service.create(completePayload, 'preparer-1');
        expect(prisma.experts.findMany).not.toHaveBeenCalled();
        expect(tx.application_reviews.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({
                workflow_status: 'SUBMITTED', prepared_by_id: 'preparer-1', reviewer_id: reviewer.id,
                checker_id: null, approver_id: null,
            }),
        }));
        expect(tx.application_review_actions.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ action: 'SUBMIT', from_status: 'DRAFT', to_status: 'SUBMITTED' }),
        });
    });

    it('resubmits the same RETURNED review and preserves history', async () => {
        const { service, prisma, tx } = createHarness();
        prisma.certification_applications.findUnique.mockResolvedValue(application('RETURNED'));
        await service.create(completePayload, 'preparer-1');
        expect(tx.application_reviews.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'review-1' } }));
        expect(tx.application_review_actions.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ action: 'RESUBMIT', from_status: 'RETURNED', to_status: 'SUBMITTED' }),
        });
    });

    it('reopens an APPROVED review when the coordinator intentionally edits it', async () => {
        const { service, prisma, tx } = createHarness();
        prisma.certification_applications.findUnique.mockResolvedValue(application('APPROVED'));
        await service.create({
            ...completePayload,
            submission_action: 'SAVE_DRAFT',
        }, 'preparer-1');
        expect(tx.application_reviews.upsert).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ workflow_status: 'RETURNED', approved_at: null }),
        }));
        expect(tx.application_review_actions.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: 'REOPEN_APPROVED',
                from_status: 'APPROVED',
                to_status: 'RETURNED',
            }),
        });
    });

    it('rejects assigning the preparer as reviewer', async () => {
        const { service, prisma } = createHarness();
        prisma.certification_applications.findUnique.mockResolvedValue(application());
        prisma.users.findFirst.mockResolvedValue({ ...reviewer, id: 'preparer-1' });
        await expect(service.create({ ...completePayload, reviewer_id: 'preparer-1' }, 'preparer-1'))
            .rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires a return reason and records SUBMITTED to RETURNED', async () => {
        const { service, prisma, tx } = createHarness();
        prisma.application_reviews.findUnique.mockResolvedValue(submittedReview());
        await expect(service.review('review-1', { action: 'RETURN' }, reviewer.id, ['TECHNICAL_REVIEWER']))
            .rejects.toBeInstanceOf(BadRequestException);
        await service.review('review-1', { action: 'RETURN', comment: 'Correct classification' }, reviewer.id, ['TECHNICAL_REVIEWER']);
        expect(tx.application_review_actions.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ action: 'RETURN', from_status: 'SUBMITTED', to_status: 'RETURNED' }),
        });
    });

    it('blocks an unassigned or unauthorized reviewer', async () => {
        const { service, prisma } = createHarness();
        prisma.application_reviews.findUnique.mockResolvedValue(submittedReview());
        await expect(service.review('review-1', { action: 'APPROVE' }, 'someone-else', ['TECHNICAL_REVIEWER']))
            .rejects.toBeInstanceOf(ForbiddenException);
        await expect(service.review('review-1', { action: 'APPROVE' }, reviewer.id, ['COORDINATOR']))
            .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('approves directly from SUBMITTED and creates durable capability evidence', async () => {
        const { service, prisma, capabilities, tx, audit } = createHarness();
        prisma.application_reviews.findUnique.mockResolvedValue(submittedReview());
        capabilities.evaluateReview.mockResolvedValue({
            review_id: 'review-1', evaluated_at: new Date(), overall_result: 'CAPABLE', items: [],
        });
        await service.review('review-1', { action: 'APPROVE' }, reviewer.id, ['TECHNICAL_REVIEWER']);
        expect(tx.application_reviews.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ workflow_status: 'APPROVED', approved_at: expect.any(Date) }),
        }));
        expect(tx.application_review_capability_snapshots.createMany).toHaveBeenCalledTimes(1);
        expect(capabilities.snapshotData).toHaveBeenCalledWith(
            expect.anything(),
            reviewer.id,
            1,
        );
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({
            action: 'APPLICATION_REVIEW_APPROVED_WITH_CAPABILITY', outcome: 'success',
        }));
    });

    it('creates a new immutable capability snapshot version after re-review approval', async () => {
        const { service, prisma, capabilities, tx } = createHarness();
        prisma.application_reviews.findUnique.mockResolvedValue(submittedReview());
        tx.application_review_capability_snapshots.aggregate.mockResolvedValue({
            _max: { approval_version: 1 },
        });
        capabilities.evaluateReview.mockResolvedValue({
            review_id: 'review-1', evaluated_at: new Date(), overall_result: 'CAPABLE', items: [],
        });
        await service.review('review-1', { action: 'APPROVE' }, reviewer.id, ['AUDITOR']);
        expect(capabilities.snapshotData).toHaveBeenCalledWith(
            expect.anything(),
            reviewer.id,
            2,
        );
    });

    it.each(['NOT_CAPABLE', 'REVIEW_REQUIRED'])('blocks reviewer approval for %s', async (overallResult) => {
        const { service, prisma, capabilities, tx, audit } = createHarness();
        prisma.application_reviews.findUnique.mockResolvedValue(submittedReview());
        capabilities.evaluateReview.mockResolvedValue({ overall_result: overallResult });
        await expect(service.review('review-1', { action: 'APPROVE' }, reviewer.id, ['AUDITOR']))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(tx.application_reviews.update).not.toHaveBeenCalled();
        expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'blocked' }));
    });

    it('blocks approval when the stored man-day calculation is incomplete', async () => {
        const { service, prisma, capabilities } = createHarness();
        prisma.application_reviews.findUnique.mockResolvedValue(submittedReview({ final_mandays: null }));
        await expect(service.review('review-1', { action: 'APPROVE' }, reviewer.id, ['LEAD_AUDITOR']))
            .rejects.toBeInstanceOf(BadRequestException);
        expect(capabilities.evaluateReview).not.toHaveBeenCalled();
    });
});

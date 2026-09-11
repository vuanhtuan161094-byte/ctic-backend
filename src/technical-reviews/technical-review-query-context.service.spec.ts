import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TechnicalReviewQueryContextService } from './technical-review-query-context.service';

function createService() {
    const prisma = {
        technical_reviews: {
            findUnique: jest.fn(),
        },
        audit_plans: {
            findUnique: jest.fn(),
        },
    };
    return {
        prisma,
        service: new TechnicalReviewQueryContextService(
            prisma as unknown as PrismaService,
        ),
    };
}

describe('TechnicalReviewQueryContextService', () => {
    it('returns a review resolved by id', async () => {
        const { prisma, service } = createService();
        const review = {
            id: 'review-1',
            reports: { audit_plan_id: 'plan-1' },
            assignments: [],
        };
        prisma.technical_reviews.findUnique.mockResolvedValue(review);

        await expect(service.getReviewOrThrow('review-1')).resolves.toBe(review);
        expect(prisma.technical_reviews.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'review-1' },
            }),
        );
    });

    it('rejects a missing technical review', async () => {
        const { prisma, service } = createService();
        prisma.technical_reviews.findUnique.mockResolvedValue(null);

        await expect(service.getReviewOrThrow('missing'))
            .rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the plan and latest ordered report context', async () => {
        const { prisma, service } = createService();
        const latestReport = { id: 'report-latest' };
        const plan = {
            id: 'plan-1',
            reports: [latestReport, { id: 'report-older' }],
        };
        prisma.audit_plans.findUnique.mockResolvedValue(plan);

        await expect(service.loadPlanReviewContext('plan-1')).resolves.toEqual({
            plan,
            report: latestReport,
        });
        expect(prisma.audit_plans.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'plan-1' },
            }),
        );
    });

    it('rejects a missing audit plan', async () => {
        const { prisma, service } = createService();
        prisma.audit_plans.findUnique.mockResolvedValue(null);

        await expect(service.loadPlanReviewContext('missing'))
            .rejects.toBeInstanceOf(NotFoundException);
    });
});

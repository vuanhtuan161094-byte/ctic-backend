import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { TechnicalReviewReviewerPolicyService } from './technical-review-reviewer-policy.service';

function createService() {
    const prisma = {
        users: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
    };
    return {
        prisma,
        service: new TechnicalReviewReviewerPolicyService(
            prisma as unknown as PrismaService,
        ),
    };
}

describe('TechnicalReviewReviewerPolicyService', () => {
    it('rejects an audit-team participant as technical reviewer', () => {
        const { service } = createService();
        const plan = {
            audit_team_appointment: {
                members: [{
                    experts: {
                        user_id: 'reviewer-a',
                        full_name: 'Reviewer A',
                    },
                }],
            },
        };

        expect(() =>
            service.assertReviewerIndependent(plan, 'reviewer-a'),
        ).toThrow(BadRequestException);
    });

    it('requires an active technical_reviewer role', async () => {
        const { prisma, service } = createService();
        prisma.users.findFirst.mockResolvedValue(null);

        await expect(service.assertReviewerEligible('reviewer-a'))
            .rejects.toThrow('không đủ eligibility');

        expect(prisma.users.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: 'reviewer-a',
                status: 'active',
            }),
        }));
    });

    it('allows coordinator and requires an explicit ADMIN override reason', () => {
        const { service } = createService();

        expect(() => service.assertAssignmentActor({
            userId: 'coordinator-a',
            roles: ['COORDINATOR'],
        } as any)).not.toThrow();

        expect(() => service.assertAssignmentActor({
            userId: 'admin-a',
            roles: ['ADMIN'],
        } as any)).toThrow('ADMIN phải nhập lý do override');

        expect(() => service.assertAssignmentActor({
            userId: 'admin-a',
            roles: ['ADMIN'],
        } as any, 'Emergency reassignment')).not.toThrow();
    });

    it('excludes audit-team users from reviewer candidates', async () => {
        const { prisma, service } = createService();
        prisma.users.findMany.mockResolvedValue([{
            id: 'reviewer-b',
            username: 'reviewer-b',
            full_name: 'Reviewer B',
            email: 'b@example.test',
        }]);
        const plan = {
            audit_team_appointment: {
                members: [{
                    experts: {
                        user_id: 'auditor-a',
                    },
                }],
            },
        };

        await expect(service.getReviewerCandidates(plan)).resolves.toEqual([{
            id: 'reviewer-b',
            username: 'reviewer-b',
            full_name: 'Reviewer B',
            email: 'b@example.test',
            eligible: true,
            independent: true,
        }]);
        expect(prisma.users.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                id: { notIn: ['auditor-a'] },
            }),
        }));
    });
});

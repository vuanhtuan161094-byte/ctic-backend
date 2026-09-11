const fs = require('node:fs');

const mainPath = 'src/technical-reviews/technical-reviews.service.ts';
const modulePath = 'src/technical-reviews/technical-reviews.module.ts';
const servicePath = 'src/technical-reviews/technical-review-reviewer-policy.service.ts';
const specPath = 'src/technical-reviews/technical-review-reviewer-policy.service.spec.ts';

let source = fs.readFileSync(mainPath, 'utf8');
let moduleSource = fs.readFileSync(modulePath, 'utf8');

if (fs.existsSync(servicePath) || fs.existsSync(specPath)) {
  throw new Error('Reviewer policy extraction target already exists');
}

const importAnchor = "import { ReassignTechnicalReviewerDto } from './dto/reassign-technical-reviewer.dto';\n";
if (source.split(importAnchor).length - 1 !== 1) throw new Error('Main import anchor mismatch');
source = source.replace(
  importAnchor,
  importAnchor + "import { TechnicalReviewReviewerPolicyService } from './technical-review-reviewer-policy.service';\n",
);

const classAnchor = '@Injectable()\nexport class TechnicalReviewsService {\n';
if (source.split(classAnchor).length - 1 !== 1) throw new Error('Class anchor mismatch');
source = source.replace(
  classAnchor,
  classAnchor + '    private readonly reviewerPolicyService: TechnicalReviewReviewerPolicyService;\n\n',
);

const constructorAnchor = `        @Optional()\n        private readonly notifications?: NotificationEngineService,\n    ) { }\n`;
const constructorReplacement = `        @Optional()\n        private readonly notifications?: NotificationEngineService,\n        @Optional()\n        reviewerPolicyService?: TechnicalReviewReviewerPolicyService,\n    ) {\n        this.reviewerPolicyService =\n            reviewerPolicyService ??\n            new TechnicalReviewReviewerPolicyService(prisma);\n    }\n`;
if (source.split(constructorAnchor).length - 1 !== 1) throw new Error('Constructor anchor mismatch');
source = source.replace(constructorAnchor, constructorReplacement);

const blockStart = source.indexOf('    private assertReviewerIndependent(');
const blockEnd = source.indexOf('    async assertCanPerformReview(', blockStart);
if (blockStart < 0 || blockEnd < 0 || blockEnd <= blockStart) {
  throw new Error('Reviewer policy block not found');
}

const wrappers = `    private assertReviewerIndependent(\n        plan: any,\n        reviewerId: string,\n    ) {\n        return this.reviewerPolicyService.assertReviewerIndependent(\n            plan,\n            reviewerId,\n        );\n    }\n\n    private async assertReviewerEligible(\n        reviewerId: string,\n    ) {\n        return this.reviewerPolicyService.assertReviewerEligible(\n            reviewerId,\n        );\n    }\n\n    private assertAssignmentActor(\n        actor: ResourceActor,\n        adminOverrideReason?: string,\n    ) {\n        return this.reviewerPolicyService.assertAssignmentActor(\n            actor,\n            adminOverrideReason,\n        );\n    }\n\n    async getReviewerCandidates(\n        planId: string,\n    ) {\n        const context = await this.loadPlanReviewContext(planId);\n        this.assertReportReady(context.report);\n        return this.reviewerPolicyService.getReviewerCandidates(\n            context.plan,\n        );\n    }\n\n`;
source = source.slice(0, blockStart) + wrappers + source.slice(blockEnd);

const moduleImportAnchor = "import { TechnicalReviewsService } from './technical-reviews.service';\n";
if (moduleSource.split(moduleImportAnchor).length - 1 !== 1) throw new Error('Module import anchor mismatch');
moduleSource = moduleSource.replace(
  moduleImportAnchor,
  moduleImportAnchor + "import { TechnicalReviewReviewerPolicyService } from './technical-review-reviewer-policy.service';\n",
);
const providerAnchor = '    TechnicalReviewsService,\n';
if (moduleSource.split(providerAnchor).length - 1 !== 1) throw new Error('Module provider anchor mismatch');
moduleSource = moduleSource.replace(
  providerAnchor,
  providerAnchor + '    TechnicalReviewReviewerPolicyService,\n',
);

const extractedService = `import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { ResourceActor } from '../security/resource-access.service';
import { normalizeRoles } from '../security/security-request';

@Injectable()
export class TechnicalReviewReviewerPolicyService {
    constructor(private readonly prisma: PrismaService) {}

    assertReviewerIndependent(
        plan: any,
        reviewerId: string,
    ): void {
        const auditMember =
            plan.audit_team_appointment
                ?.members
                ?.find(
                    (member: any) =>
                        member.experts
                            ?.user_id ===
                        reviewerId,
                );

        if (auditMember) {
            throw new BadRequestException(
                \`Người thẩm xét không được là thành viên đoàn đánh giá (${'${auditMember.experts?.full_name ?? \'không xác định\'}'}).\`,
            );
        }
    }

    async assertReviewerEligible(
        reviewerId: string,
    ) {
        const reviewer = await this.prisma.users.findFirst({
            where: {
                id: reviewerId,
                status: 'active',
                user_roles: {
                    some: {
                        roles: {
                            role_name: 'technical_reviewer',
                        },
                    },
                },
            },
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        });
        if (!reviewer) {
            throw new BadRequestException(
                'Người được chọn không hoạt động hoặc không đủ eligibility Người thẩm xét kỹ thuật',
            );
        }
        return reviewer;
    }

    assertAssignmentActor(
        actor: ResourceActor,
        adminOverrideReason?: string,
    ): void {
        const roles = normalizeRoles(actor.roles);
        if (roles.includes('COORDINATOR')) return;
        if (roles.includes('ADMIN') && adminOverrideReason?.trim()) return;
        if (roles.includes('ADMIN')) {
            throw new BadRequestException(
                'ADMIN phải nhập lý do override khi phân công nghiệp vụ',
            );
        }
        throw new BadRequestException(
            'Chỉ Điều phối viên hoặc ADMIN override được phân công người thẩm xét',
        );
    }

    async getReviewerCandidates(
        plan: any,
    ) {
        const conflictedIds = new Set(
            (plan.audit_team_appointment?.members ?? [])
                .map((member: any) => member.experts?.user_id)
                .filter(Boolean),
        );
        const candidates = await this.prisma.users.findMany({
            where: {
                status: 'active',
                id: { notIn: Array.from(conflictedIds) },
                user_roles: {
                    some: {
                        roles: {
                            role_name: 'technical_reviewer',
                        },
                    },
                },
            },
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
            orderBy: [
                { full_name: 'asc' },
                { username: 'asc' },
            ],
        });
        return candidates.map((candidate) => ({
            ...candidate,
            eligible: true,
            independent: true,
        }));
    }
}
`;

const extractedSpec = `import { BadRequestException } from '@nestjs/common';

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
`;

fs.writeFileSync(mainPath, source);
fs.writeFileSync(modulePath, moduleSource);
fs.writeFileSync(servicePath, extractedService);
fs.writeFileSync(specPath, extractedSpec);

import { BadRequestException, Injectable } from '@nestjs/common';

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
                `Người thẩm xét không được là thành viên đoàn đánh giá (${auditMember.experts?.full_name ?? 'không xác định'}).`,
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
        const conflictedIds = new Set<string>(
            (plan.audit_team_appointment?.members ?? [])
                .map((member: any) => member.experts?.user_id)
                .filter(
                    (value: unknown): value is string =>
                        typeof value === 'string' && value.length > 0,
                ),
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

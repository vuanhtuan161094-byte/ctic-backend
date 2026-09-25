import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CompleteExpertMonitoringDto } from './dto/complete-expert-monitoring.dto';
import { CreateExpertMonitoringDto } from './dto/create-expert-monitoring.dto';
import { CreateExpertTrainingDto } from './dto/create-expert-training.dto';
import { EvaluateExpertTrainingDto } from './dto/evaluate-expert-training.dto';
import { CreateExpertCertificateDto } from './dto/create-expert-certificate.dto';
import { CreateExpertWorkExperienceDto } from './dto/create-expert-work-experience.dto';
import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertCertificateDto } from './dto/update-expert-certificate.dto';
import { UpdateExpertWorkExperienceDto } from './dto/update-expert-work-experience.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import {
    CancelExpertResourceRecordDto,
    CreateExpertAvailabilityDto,
    CreateExpertCustomerConflictDto,
    ReviewExpertCustomerConflictDto,
} from './dto/expert-resource-governance.dto';
import { ExpertResourceGovernanceService } from './expert-resource-governance.service';

@Injectable()
export class ExpertsService {
    private readonly resourceGovernance: ExpertResourceGovernanceService;

    constructor(
        private readonly prisma: PrismaService,
    ) {
        this.resourceGovernance = new ExpertResourceGovernanceService(prisma);
    }

    private normalizeStatus(status?: string) {
        const value = status?.trim().toLowerCase();
        return value === 'active' || value === 'inactive'
            ? value
            : undefined;
    }

    private normalizeUpper(value?: string | null) {
        return value?.trim().toUpperCase() ?? '';
    }

    private nullableText(value?: string | null) {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }

    private parseDate(value: string | undefined, fieldName: string) {
        if (!value) {
            return null;
        }

        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

        if (!match) {
            throw new BadRequestException(`${fieldName} không hợp lệ`);
        }

        const date = new Date(Date.UTC(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
        ));

        if (Number.isNaN(date.getTime())) {
            throw new BadRequestException(`${fieldName} không hợp lệ`);
        }

        return date;
    }

    private startOfUtcDay(value = new Date()) {
        return new Date(Date.UTC(
            value.getUTCFullYear(),
            value.getUTCMonth(),
            value.getUTCDate(),
        ));
    }

    private addMonths(value: Date, months: number) {
        const result = new Date(value.getTime());
        result.setUTCMonth(result.getUTCMonth() + months);
        return result;
    }

    private addYears(value: Date, years: number) {
        const result = new Date(value.getTime());
        result.setUTCFullYear(result.getUTCFullYear() + years);
        return result;
    }

    private async assertCompetencyBelongsToExpert(
        expertId: string,
        competencyId?: string,
    ) {
        if (!competencyId) return null;
        const competency = await this.prisma.expert_competencies.findFirst({
            where: {
                id: competencyId,
                expert_id: expertId,
            },
            select: {
                id: true,
                management_system: true,
                standard_code: true,
                competency_role: true,
                approval_status: true,
            },
        });
        if (!competency) {
            throw new BadRequestException(
                'Phạm vi năng lực được liên kết không thuộc chuyên gia này',
            );
        }
        return competency;
    }

    private async assertAuditPlanAssignedToExpert(
        expertId: string,
        auditPlanId?: string,
    ) {
        if (!auditPlanId) return;
        const assignment = await this.prisma.audit_team_members.findFirst({
            where: {
                expert_id: expertId,
                assignment_status: { not: 'cancelled' },
                audit_team_appointments: {
                    audit_plan_id: auditPlanId,
                },
            },
            select: { id: true },
        });
        if (!assignment) {
            throw new BadRequestException(
                'Kế hoạch đánh giá được liên kết không có chuyên gia này trong đoàn đánh giá',
            );
        }
    }

    private validateDateRange(
        startDate: Date | null,
        endDate: Date | null,
        startLabel: string,
        endLabel: string,
    ) {
        if (startDate && endDate && endDate < startDate) {
            throw new BadRequestException(
                `${endLabel} phải bằng hoặc sau ${startLabel.toLowerCase()}`,
            );
        }
    }

    private resolveManagementSystem(standardName?: string | null) {
        const standard = this.normalizeUpper(standardName);

        if (standard.includes('ISO 9001')) return 'QMS';
        if (standard.includes('ISO 14001')) return 'EMS';
        if (standard.includes('ISO 45001')) return 'OHSMS';
        if (standard.includes('ISO 27001')) return 'ISMS';
        if (standard.includes('ISO 50001')) return 'ENERGY';

        throw new BadRequestException(
            `Chưa cấu hình hệ thống quản lý cho tiêu chuẩn ${standardName ?? ''}`,
        );
    }

    private resolveCompetencyRoles(teamRole?: string) {
        const roleMap: Record<string, string[]> = {
            TEAM_LEADER: ['LEAD_AUDITOR'],
            AUDITOR: ['AUDITOR', 'LEAD_AUDITOR'],
            TECHNICAL_EXPERT: ['TECHNICAL_EXPERT'],
            WITNESS_EVALUATOR: ['WITNESS_EVALUATOR'],
        };

        const roles = roleMap[this.normalizeUpper(teamRole)];

        if (!roles) {
            throw new BadRequestException(
                'Vai trò đoàn đánh giá chưa được hỗ trợ đề xuất năng lực',
            );
        }

        return roles;
    }

    private async getExpertOrThrow(id: string) {
        const expert = await this.prisma.experts.findUnique({
            where: { id },
        });

        if (!expert) {
            throw new NotFoundException('Không tìm thấy chuyên gia');
        }

        return expert;
    }

    private async getAccountOrThrow(userId: string) {
        const account = await this.prisma.users.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                email: true,
                full_name: true,
                status: true,
            },
        });

        if (!account) {
            throw new NotFoundException('Không tìm thấy tài khoản người dùng');
        }

        if (account.status?.toLowerCase() !== 'active') {
            throw new BadRequestException('Tài khoản người dùng không hoạt động');
        }

        return account;
    }

    private async ensureAccountAvailable(userId: string, expertId?: string) {
        const linked = await this.prisma.experts.findUnique({
            where: { user_id: userId },
            select: { id: true },
        });

        if (linked && linked.id !== expertId) {
            throw new ConflictException(
                'Tài khoản này đã được liên kết với một chuyên gia khác',
            );
        }
    }

    private async ensureEmployeeCodeAvailable(
        employeeCode?: string | null,
        expertId?: string,
    ) {
        const code = this.nullableText(employeeCode);

        if (!code) return;

        const existing = await this.prisma.experts.findFirst({
            where: {
                employee_code: code,
                ...(expertId ? { id: { not: expertId } } : {}),
            },
            select: { id: true },
        });

        if (existing) {
            throw new ConflictException('Mã chuyên gia đã được sử dụng');
        }
    }

    private buildExpertSummary(
        competencies: Array<{
            approval_status: string;
            expiry_date: Date | null;
            management_system?: string;
            standard_code?: string;
            iaf_code?: string;
            nace_code?: string | null;
        }>,
        auditMembers: Array<{ planned_end_date: Date }>,
        certificateCount = 0,
    ) {
        const now = new Date();
        const expiryThreshold = new Date(
            now.getTime() + 90 * 24 * 60 * 60 * 1000,
        );
        const approved = competencies.filter(
            (item) => item.approval_status === 'APPROVED',
        );
        const programs = new Set(
            approved.map(
                (item) => `${item.management_system ?? ''}|${item.standard_code ?? ''}`,
            ),
        );
        const industryCodes = new Set<string>();

        approved.forEach((item) => {
            if (item.iaf_code) industryCodes.add(`IAF ${item.iaf_code}`);
            if (item.nace_code) industryCodes.add(`NACE ${item.nace_code}`);
        });

        const lastAuditDate = auditMembers.reduce<Date | null>(
            (latest, item) => !latest || item.planned_end_date > latest
                ? item.planned_end_date
                : latest,
            null,
        );

        return {
            competency_summary: {
                total: competencies.length,
                approved: approved.length,
                draft: competencies.filter(
                    (item) => item.approval_status === 'DRAFT',
                ).length,
                suspended: competencies.filter(
                    (item) => item.approval_status === 'SUSPENDED',
                ).length,
                expiring: approved.filter(
                    (item) => item.expiry_date &&
                        item.expiry_date >= now &&
                        item.expiry_date <= expiryThreshold,
                ).length,
                programs: programs.size,
                industry_codes: Array.from(industryCodes),
            },
            audit_summary: {
                total: auditMembers.length,
                last_audit_date: lastAuditDate,
            },
            certificate_summary: {
                total: certificateCount,
            },
        };
    }

    async findAll(search?: string, status?: string) {
        const safeSearch = search?.trim();
        const safeStatus = this.normalizeStatus(status);

        const experts = await this.prisma.experts.findMany({
            where: {
                ...(safeStatus ? { status: safeStatus } : {}),
                ...(safeSearch ? {
                    OR: [
                        { full_name: { contains: safeSearch } },
                        { email: { contains: safeSearch } },
                        { phone: { contains: safeSearch } },
                        { employee_code: { contains: safeSearch } },
                        { organization: { contains: safeSearch } },
                    ],
                } : {}),
            },
            orderBy: [
                { status: 'asc' },
                { full_name: 'asc' },
            ],
            include: {
                user_account: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        full_name: true,
                        status: true,
                    },
                },
                competencies: {
                    select: {
                        approval_status: true,
                        expiry_date: true,
                        management_system: true,
                        standard_code: true,
                        iaf_code: true,
                        nace_code: true,
                    },
                },
                audit_team_members: {
                    select: {
                        planned_end_date: true,
                    },
                },
                _count: {
                    select: {
                        certificates: true,
                    },
                },
            },
        });

        return experts.map(({ competencies, audit_team_members, _count, ...expert }) => ({
            ...expert,
            competencies,
            ...this.buildExpertSummary(
                competencies,
                audit_team_members,
                _count.certificates,
            ),
        }));
    }

    async getOverview() {
        const now = new Date();
        const startOfToday = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate(),
        ));
        const expiryThreshold = new Date(
            now.getTime() + 90 * 24 * 60 * 60 * 1000,
        );

        const [
            total,
            active,
            linkedAccounts,
            approvedProfiles,
            competencies,
            expiringCertificates,
        ] = await Promise.all([
            this.prisma.experts.count(),
            this.prisma.experts.count({ where: { status: 'active' } }),
            this.prisma.experts.count({ where: { user_id: { not: null } } }),
            this.prisma.experts.count({ where: { profile_status: 'APPROVED' } }),
            this.prisma.expert_competencies.findMany({
                select: {
                    approval_status: true,
                    effective_date: true,
                    expiry_date: true,
                    approved_at: true,
                    evidence_summary: true,
                    evidence_records: {
                        where: {
                            status: 'ACTIVE',
                            OR: [
                                { valid_until: null },
                                { valid_until: { gte: startOfToday } },
                            ],
                        },
                        select: { id: true },
                    },
                    review_records: {
                        orderBy: [
                            { review_date: 'desc' },
                            { created_at: 'desc' },
                        ],
                        take: 1,
                        select: {
                            review_date: true,
                            next_review_date: true,
                            result: true,
                        },
                    },
                },
            }),
            this.prisma.expert_certificates.count({
                where: {
                    expiry_date: {
                        gte: startOfToday,
                        lte: expiryThreshold,
                    },
                },
            }),
        ]);

        const addMonths = (value: Date, months: number) => {
            const result = new Date(value.getTime());
            result.setUTCMonth(result.getUTCMonth() + months);
            return result;
        };
        const reviewDueDate = (item: (typeof competencies)[number]) => {
            const latest = item.review_records[0];
            if (latest?.next_review_date) return latest.next_review_date;
            if (item.approval_status !== 'APPROVED') return null;
            return addMonths(
                latest?.review_date ?? item.approved_at ?? item.effective_date,
                12,
            );
        };

        return {
            generated_at: new Date(),
            experts: {
                total,
                active,
                inactive: total - active,
                linked_accounts: linkedAccounts,
                approved_profiles: approvedProfiles,
                pending_profiles: total - approvedProfiles,
            },
            competencies: {
                total: competencies.length,
                approved: competencies.filter(
                    (item) => item.approval_status === 'APPROVED',
                ).length,
                draft: competencies.filter(
                    (item) => item.approval_status === 'DRAFT',
                ).length,
                suspended: competencies.filter(
                    (item) => item.approval_status === 'SUSPENDED',
                ).length,
                expiring_90_days: competencies.filter(
                    (item) => item.approval_status === 'APPROVED' &&
                        item.expiry_date &&
                        item.expiry_date >= startOfToday &&
                        item.expiry_date <= expiryThreshold,
                ).length,
                expired: competencies.filter(
                    (item) => item.approval_status === 'APPROVED' &&
                        item.expiry_date &&
                        item.expiry_date < startOfToday,
                ).length,
                evidence_gaps: competencies.filter(
                    (item) => item.approval_status === 'APPROVED' &&
                        item.evidence_records.length === 0 &&
                        !item.evidence_summary?.trim(),
                ).length,
                review_overdue: competencies.filter((item) => {
                    const due = reviewDueDate(item);
                    return due !== null && due < startOfToday;
                }).length,
                review_due_90_days: competencies.filter((item) => {
                    const due = reviewDueDate(item);
                    return due !== null &&
                        due >= startOfToday &&
                        due <= expiryThreshold;
                }).length,
                management_action_required: competencies.filter(
                    (item) => item.review_records[0]?.result === 'UNSATISFACTORY',
                ).length,
            },
            certificates: {
                expiring_90_days: expiringCertificates,
            },
        };
    }

    async getAccountOptions() {
        const accounts = await this.prisma.users.findMany({
            where: { status: 'active' },
            orderBy: [
                { full_name: 'asc' },
                { username: 'asc' },
            ],
            select: {
                id: true,
                username: true,
                email: true,
                full_name: true,
                status: true,
                user_roles: {
                    select: {
                        roles: {
                            select: {
                                role_name: true,
                            },
                        },
                    },
                },
                expert_profile: {
                    select: {
                        id: true,
                        employee_code: true,
                        full_name: true,
                    },
                },
            },
        });

        return accounts.map((account) => ({
            id: account.id,
            username: account.username,
            email: account.email,
            full_name: account.full_name,
            status: account.status,
            roles: account.user_roles.map((item) => item.roles.role_name),
            linked_expert: account.expert_profile,
            available: !account.expert_profile,
        }));
    }

    async findOne(id: string) {
        const expert = await this.prisma.experts.findUnique({
            where: { id },
            include: {
                user_account: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        full_name: true,
                        status: true,
                        user_roles: {
                            select: {
                                roles: {
                                    select: { role_name: true },
                                },
                            },
                        },
                    },
                },
                approved_by_user: {
                    select: {
                        id: true,
                        username: true,
                        full_name: true,
                        email: true,
                    },
                },
                competencies: {
                    orderBy: [
                        { approval_status: 'asc' },
                        { standard_code: 'asc' },
                        { iaf_code: 'asc' },
                    ],
                    include: {
                        action_records: {
                            where: { action_type: { in: ['SUBMIT', 'RETURN'] } },
                            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
                            take: 1,
                            select: { id: true, action_type: true, actor_id: true, reason: true, created_at: true },
                        },
                        approved_by_user: {
                            select: {
                                id: true,
                                username: true,
                                full_name: true,
                                email: true,
                            },
                        },
                    },
                },
                work_experiences: {
                    orderBy: { start_date: 'desc' },
                },
                certificates: {
                    orderBy: [
                        { expiry_date: 'asc' },
                        { issue_date: 'desc' },
                    ],
                },
                audit_team_members: {
                    orderBy: { planned_start_date: 'desc' },
                    include: {
                        scopes: true,
                        audit_team_appointments: {
                            include: {
                                audit_plans: {
                                    include: {
                                        certification_projects: {
                                            include: {
                                                certification_applications: {
                                                    include: { customers: true },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!expert) {
            throw new NotFoundException('Không tìm thấy chuyên gia');
        }

        const approvedCompetencies = expert.competencies.filter(
            (item) => item.approval_status === 'APPROVED',
        );
        const programs = Array.from(new Map(
            approvedCompetencies.map((item) => [
                `${item.management_system}|${item.standard_code}`,
                {
                    management_system: item.management_system,
                    standard_code: item.standard_code,
                    roles: Array.from(new Set(
                        approvedCompetencies
                            .filter((other) =>
                                other.management_system === item.management_system &&
                                other.standard_code === item.standard_code,
                            )
                            .map((other) => other.competency_role),
                    )),
                },
            ]),
        ).values());
        const industryCodes = Array.from(new Map(
            approvedCompetencies.map((item) => [
                `${item.iaf_code}|${item.nace_code ?? ''}`,
                {
                    iaf_code: item.iaf_code,
                    nace_code: item.nace_code,
                    scope_description: item.scope_description,
                    standard_code: item.standard_code,
                },
            ]),
        ).values());

        return {
            ...expert,
            account: expert.user_account
                ? {
                    ...expert.user_account,
                    roles: expert.user_account.user_roles.map(
                        (item) => item.roles.role_name,
                    ),
                }
                : null,
            programs,
            industry_codes: industryCodes,
            summary: {
                approved_competencies: approvedCompetencies.length,
                pending_competencies: expert.competencies.filter(
                    (item) => item.approval_status === 'PENDING_APPROVAL',
                ).length,
                audit_count: expert.audit_team_members.length,
                work_experience_count: expert.work_experiences.length,
                certificate_count: expert.certificates.length,
            },
        };
    }

    async getDevelopment(expertId: string) {
        const expert = await this.prisma.experts.findUnique({
            where: { id: expertId },
            select: {
                id: true,
                full_name: true,
                employee_code: true,
                profile_status: true,
                approved_at: true,
                created_at: true,
                competencies: {
                    orderBy: [
                        { management_system: 'asc' },
                        { standard_code: 'asc' },
                        { competency_role: 'asc' },
                    ],
                    select: {
                        id: true,
                        management_system: true,
                        standard_code: true,
                        competency_role: true,
                        iaf_code: true,
                        nace_code: true,
                        approval_status: true,
                    },
                },
                training_records: {
                    orderBy: [
                        { start_date: 'desc' },
                        { created_at: 'desc' },
                    ],
                    include: {
                        competency: {
                            select: {
                                id: true,
                                management_system: true,
                                standard_code: true,
                                competency_role: true,
                                iaf_code: true,
                                nace_code: true,
                            },
                        },
                        creator: {
                            select: { id: true, username: true, full_name: true },
                        },
                        evaluator: {
                            select: { id: true, username: true, full_name: true },
                        },
                        canceller: {
                            select: { id: true, username: true, full_name: true },
                        },
                    },
                },
                monitoring_records: {
                    orderBy: [
                        { planned_date: 'desc' },
                        { created_at: 'desc' },
                    ],
                    include: {
                        competency: {
                            select: {
                                id: true,
                                management_system: true,
                                standard_code: true,
                                competency_role: true,
                                iaf_code: true,
                                nace_code: true,
                            },
                        },
                        audit_plan: {
                            select: {
                                id: true,
                                plan_code: true,
                                audit_type: true,
                                planned_start_date: true,
                                planned_end_date: true,
                            },
                        },
                        creator: {
                            select: { id: true, username: true, full_name: true },
                        },
                        assessor: {
                            select: { id: true, username: true, full_name: true },
                        },
                        completer: {
                            select: { id: true, username: true, full_name: true },
                        },
                        canceller: {
                            select: { id: true, username: true, full_name: true },
                        },
                        witness_items: {
                            orderBy: { criterion_code: 'asc' },
                        },
                    },
                },
                audit_team_members: {
                    where: {
                        assignment_status: { not: 'cancelled' },
                    },
                    orderBy: { planned_start_date: 'desc' },
                    select: {
                        team_role: true,
                        planned_start_date: true,
                        planned_end_date: true,
                        audit_team_appointments: {
                            select: {
                                audit_plans: {
                                    select: {
                                        id: true,
                                        plan_code: true,
                                        audit_type: true,
                                        planned_start_date: true,
                                        planned_end_date: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!expert) {
            throw new NotFoundException('Không tìm thấy chuyên gia');
        }

        const trainingIds = expert.training_records.map((item) => item.id);
        const monitoringIds = expert.monitoring_records.map((item) => item.id);
        const attachments = trainingIds.length || monitoringIds.length
            ? await this.prisma.documentFile.findMany({
                where: {
                    is_current: true,
                    OR: [
                        ...(trainingIds.length ? [{
                            entity_type: 'expert_training_record',
                            entity_id: { in: trainingIds },
                        }] : []),
                        ...(monitoringIds.length ? [{
                            entity_type: 'expert_monitoring_record',
                            entity_id: { in: monitoringIds },
                        }] : []),
                    ],
                },
                orderBy: [
                    { entity_type: 'asc' },
                    { entity_id: 'asc' },
                    { version_no: 'desc' },
                ],
            })
            : [];
        const attachmentMap = new Map<string, Array<(typeof attachments)[number] & {
            download_url: string;
        }>>();
        for (const item of attachments) {
            const key = `${item.entity_type}|${item.entity_id}`;
            const rows = attachmentMap.get(key) ?? [];
            rows.push({
                ...item,
                download_url: `/document-files/${item.id}/download`,
            });
            attachmentMap.set(key, rows);
        }

        const now = this.startOfUtcDay();
        const due90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        const last12Months = this.addMonths(now, -12);
        const completedMonitoring = expert.monitoring_records.filter(
            (item) => item.status === 'COMPLETED' && item.performed_date,
        );
        const approvedAuditorCompetencies = expert.competencies.filter(
            (item) => item.approval_status === 'APPROVED' &&
                ['AUDITOR', 'LEAD_AUDITOR'].includes(
                    this.normalizeUpper(item.competency_role),
                ),
        );
        const auditorMonitoringApplicable = approvedAuditorCompetencies.length > 0;
        const emsAuditor = approvedAuditorCompetencies.some(
            (item) => this.normalizeUpper(item.management_system) === 'EMS',
        );
        const latestWitness = completedMonitoring
            .filter((item) => item.monitoring_method === 'WITNESS')
            .sort((left, right) =>
                (right.performed_date?.getTime() ?? 0) -
                (left.performed_date?.getTime() ?? 0),
            )[0] ?? null;
        const witnessBaseline = latestWitness?.performed_date ??
            expert.approved_at ?? expert.created_at;
        const witnessDueDate = auditorMonitoringApplicable
            ? this.addYears(witnessBaseline, 3)
            : null;
        const witnessStatus = !witnessDueDate
            ? 'NOT_APPLICABLE'
            : witnessDueDate < now
                ? 'OVERDUE'
                : witnessDueDate <= due90
                    ? 'DUE_90_DAYS'
                    : 'CURRENT';
        const hasReportReview12m = completedMonitoring.some(
            (item) => item.monitoring_method === 'AUDIT_REPORT_REVIEW' &&
                item.performed_date! >= last12Months,
        );
        const hasFeedback12m = completedMonitoring.some(
            (item) => ['CUSTOMER_FEEDBACK', 'MARKET_FEEDBACK'].includes(
                item.monitoring_method,
            ) && item.performed_date! >= last12Months,
        );
        const completedEmsMonitoring = completedMonitoring.filter(
            (item) => this.normalizeUpper(item.management_system) === 'EMS',
        );
        const latestEmsWitness = completedEmsMonitoring
            .filter((item) => item.monitoring_method === 'WITNESS')
            .sort((left, right) =>
                (right.performed_date?.getTime() ?? 0) -
                (left.performed_date?.getTime() ?? 0),
            )[0] ?? null;
        const emsWitnessCurrent = Boolean(
            latestEmsWitness?.performed_date &&
            this.addYears(latestEmsWitness.performed_date, 3) >= now,
        );
        const hasEmsFeedback12m = completedEmsMonitoring.some(
            (item) => ['CUSTOMER_FEEDBACK', 'MARKET_FEEDBACK'].includes(
                item.monitoring_method,
            ) && item.performed_date! >= last12Months,
        );
        const witnessCurrent = witnessStatus === 'CURRENT' ||
            witnessStatus === 'DUE_90_DAYS';

        const auditPlanOptions = Array.from(new Map(
            expert.audit_team_members.map((member) => {
                const plan = member.audit_team_appointments.audit_plans;
                return [plan.id, {
                    ...plan,
                    team_role: member.team_role,
                }];
            }),
        ).values());

        return {
            expert: {
                id: expert.id,
                full_name: expert.full_name,
                employee_code: expert.employee_code,
                profile_status: expert.profile_status,
            },
            competencies: expert.competencies,
            trainings: expert.training_records.map((item) => ({
                ...item,
                attachments: attachmentMap.get(
                    `expert_training_record|${item.id}`,
                ) ?? [],
            })),
            monitoring: expert.monitoring_records.map((item) => ({
                ...item,
                attachments: attachmentMap.get(
                    `expert_monitoring_record|${item.id}`,
                ) ?? [],
            })),
            audit_plan_options: auditPlanOptions,
            governance: {
                training: {
                    planned: expert.training_records.filter(
                        (item) => item.status === 'PLANNED',
                    ).length,
                    completed: expert.training_records.filter(
                        (item) => item.status === 'COMPLETED',
                    ).length,
                    effectiveness_pending: expert.training_records.filter(
                        (item) => item.status === 'COMPLETED' &&
                            !item.effectiveness_result,
                    ).length,
                    unsatisfactory: expert.training_records.filter(
                        (item) => item.effectiveness_result === 'UNSATISFACTORY',
                    ).length,
                },
                monitoring: {
                    planned: expert.monitoring_records.filter(
                        (item) => item.status === 'PLANNED',
                    ).length,
                    overdue: expert.monitoring_records.filter((item) => {
                        if (item.status !== 'PLANNED') return false;
                        return (item.due_date ?? item.planned_date) < now;
                    }).length,
                    unsatisfactory: expert.monitoring_records.filter(
                        (item) => item.status === 'COMPLETED' &&
                            item.result === 'UNSATISFACTORY',
                    ).length,
                    improvement_required: expert.monitoring_records.filter(
                        (item) => item.status === 'COMPLETED' &&
                            item.result === 'IMPROVEMENT_REQUIRED',
                    ).length,
                },
                witness: {
                    applicable: auditorMonitoringApplicable,
                    last_witness_date: latestWitness?.performed_date ?? null,
                    due_date: witnessDueDate,
                    status: witnessStatus,
                    frequency_years: 3,
                },
                current_cycle_coverage: {
                    audit_report_review_12m: hasReportReview12m,
                    customer_or_market_feedback_12m: hasFeedback12m,
                    witness_current: witnessCurrent,
                    documented_follow_up_complete:
                        !auditorMonitoringApplicable ||
                        (witnessCurrent && hasReportReview12m && hasFeedback12m),
                    ems_auditor: emsAuditor,
                    ems_required_methods_met:
                        !emsAuditor || (emsWitnessCurrent && hasEmsFeedback12m),
                },
                management_action_required:
                    expert.training_records.some(
                        (item) => item.effectiveness_result === 'UNSATISFACTORY',
                    ) || expert.monitoring_records.some(
                        (item) => item.status === 'COMPLETED' &&
                            item.result === 'UNSATISFACTORY',
                    ),
            },
        };
    }

    async createTraining(
        expertId: string,
        dto: CreateExpertTrainingDto,
        actorId: string,
    ) {
        await this.getExpertOrThrow(expertId);
        const competency = await this.assertCompetencyBelongsToExpert(
            expertId,
            dto.competency_id,
        );
        const startDate = this.parseDate(dto.start_date, 'Ngày bắt đầu đào tạo');
        const endDate = dto.end_date
            ? this.parseDate(dto.end_date, 'Ngày kết thúc đào tạo')
            : null;
        this.validateDateRange(
            startDate,
            endDate,
            'Ngày bắt đầu đào tạo',
            'Ngày kết thúc đào tạo',
        );
        const status = this.normalizeUpper(dto.status || 'PLANNED');

        return this.prisma.expert_training_records.create({
            data: {
                expert_id: expertId,
                competency_id: dto.competency_id ?? null,
                training_type: this.normalizeUpper(dto.training_type),
                title: dto.title.trim(),
                provider: this.nullableText(dto.provider),
                delivery_mode: dto.delivery_mode
                    ? this.normalizeUpper(dto.delivery_mode)
                    : null,
                management_system: this.nullableText(
                    competency?.management_system ?? dto.management_system,
                )?.toUpperCase() ?? null,
                standard_code: this.nullableText(
                    competency?.standard_code ?? dto.standard_code,
                )?.toUpperCase() ?? null,
                start_date: startDate!,
                end_date: endDate,
                duration_hours: dto.duration_hours ?? null,
                status,
                completion_result: status === 'COMPLETED'
                    ? this.nullableText(dto.completion_result) ?? 'COMPLETED'
                    : null,
                certificate_number: this.nullableText(dto.certificate_number),
                note: this.nullableText(dto.note),
                created_by: actorId,
            },
        });
    }

    async evaluateTraining(
        expertId: string,
        trainingId: string,
        dto: EvaluateExpertTrainingDto,
        actorId: string,
    ) {
        const record = await this.prisma.expert_training_records.findFirst({
            where: { id: trainingId, expert_id: expertId },
        });
        if (!record) {
            throw new NotFoundException('Không tìm thấy hồ sơ đào tạo');
        }
        if (record.status === 'CANCELLED') {
            throw new BadRequestException(
                'Không thể đánh giá hiệu quả đối với kế hoạch đào tạo đã hủy',
            );
        }

        return this.prisma.expert_training_records.update({
            where: { id: trainingId },
            data: {
                status: 'COMPLETED',
                completion_result: record.completion_result ?? 'COMPLETED',
                effectiveness_method: this.normalizeUpper(dto.method),
                effectiveness_result: this.normalizeUpper(dto.result),
                effectiveness_score: dto.score ?? null,
                effectiveness_comment: this.nullableText(dto.comment),
                evaluated_by: actorId,
                evaluated_at: new Date(),
            },
        });
    }

    async cancelTraining(
        expertId: string,
        trainingId: string,
        reason: string,
        actorId: string,
    ) {
        const record = await this.prisma.expert_training_records.findFirst({
            where: { id: trainingId, expert_id: expertId },
        });
        if (!record) {
            throw new NotFoundException('Không tìm thấy hồ sơ đào tạo');
        }
        if (record.status === 'COMPLETED') {
            throw new BadRequestException(
                'Không thể hủy hồ sơ đào tạo đã hoàn thành',
            );
        }
        if (record.status === 'CANCELLED') return record;

        return this.prisma.expert_training_records.update({
            where: { id: trainingId },
            data: {
                status: 'CANCELLED',
                cancelled_by: actorId,
                cancelled_at: new Date(),
                cancellation_reason: reason.trim(),
            },
        });
    }

    async createMonitoring(
        expertId: string,
        dto: CreateExpertMonitoringDto,
        actorId: string,
    ) {
        await this.getExpertOrThrow(expertId);
        const competency = await this.assertCompetencyBelongsToExpert(
            expertId,
            dto.competency_id,
        );
        await this.assertAuditPlanAssignedToExpert(expertId, dto.audit_plan_id);
        if (dto.assessor_user_id) {
            await this.getAccountOrThrow(dto.assessor_user_id);
        }
        const plannedDate = this.parseDate(
            dto.planned_date,
            'Ngày dự kiến giám sát',
        );
        const dueDate = dto.due_date
            ? this.parseDate(dto.due_date, 'Hạn giám sát')
            : null;
        this.validateDateRange(
            plannedDate,
            dueDate,
            'Ngày dự kiến giám sát',
            'Hạn giám sát',
        );

        return this.prisma.expert_monitoring_records.create({
            data: {
                expert_id: expertId,
                competency_id: dto.competency_id ?? null,
                monitoring_method: this.normalizeUpper(dto.monitoring_method),
                monitoring_content: dto.monitoring_content.trim(),
                plan_type: this.normalizeUpper(dto.plan_type || 'SCHEDULED'),
                planned_date: plannedDate!,
                due_date: dueDate,
                management_system: this.nullableText(
                    competency?.management_system ?? dto.management_system,
                )?.toUpperCase() ?? null,
                standard_code: this.nullableText(
                    competency?.standard_code ?? dto.standard_code,
                )?.toUpperCase() ?? null,
                audit_plan_id: dto.audit_plan_id ?? null,
                assessor_user_id: dto.assessor_user_id ?? null,
                status: 'PLANNED',
                created_by: actorId,
            },
        });
    }

    async completeMonitoring(
        expertId: string,
        monitoringId: string,
        dto: CompleteExpertMonitoringDto,
        actorId: string,
    ) {
        const record = await this.prisma.expert_monitoring_records.findFirst({
            where: { id: monitoringId, expert_id: expertId },
        });
        if (!record) {
            throw new NotFoundException('Không tìm thấy hồ sơ giám sát năng lực');
        }
        if (record.status === 'CANCELLED') {
            throw new BadRequestException(
                'Không thể hoàn tất kế hoạch giám sát đã hủy',
            );
        }
        if (record.status === 'COMPLETED') {
            throw new BadRequestException('Hồ sơ giám sát đã hoàn tất');
        }

        const performedDate = this.parseDate(
            dto.performed_date,
            'Ngày thực hiện giám sát',
        );
        const nextMonitoringDate = dto.next_monitoring_date
            ? this.parseDate(dto.next_monitoring_date, 'Ngày giám sát tiếp theo')
            : null;
        this.validateDateRange(
            performedDate,
            nextMonitoringDate,
            'Ngày thực hiện giám sát',
            'Ngày giám sát tiếp theo',
        );
        const result = this.normalizeUpper(dto.result);
        if (
            result !== 'SATISFACTORY' &&
            !this.nullableText(dto.required_action)
        ) {
            throw new BadRequestException(
                'Kết quả cần cải tiến/không đạt phải có hành động yêu cầu',
            );
        }

        const witnessItems = dto.witness_items ?? [];
        if (record.monitoring_method === 'WITNESS' && witnessItems.length === 0) {
            throw new BadRequestException(
                'Đánh giá chứng kiến phải có kết quả tiêu chí F.09',
            );
        }
        if (record.monitoring_method !== 'WITNESS' && witnessItems.length > 0) {
            throw new BadRequestException(
                'Tiêu chí F.09 chỉ áp dụng cho phương pháp đánh giá chứng kiến',
            );
        }
        const criterionCodes = new Set(
            witnessItems.map((item) => item.criterion_code.trim().toUpperCase()),
        );
        if (criterionCodes.size !== witnessItems.length) {
            throw new BadRequestException(
                'Tiêu chí đánh giá chứng kiến không được trùng mã',
            );
        }
        let score = dto.score ?? null;
        if (record.monitoring_method === 'WITNESS' && score === null) {
            const numericRatings = witnessItems
                .map((item) => Number(item.rating))
                .filter((value) => Number.isFinite(value));
            score = numericRatings.length
                ? Number((
                    numericRatings.reduce((sum, value) => sum + value, 0) /
                    numericRatings.length /
                    4 * 100
                ).toFixed(2))
                : null;
        }

        return this.prisma.$transaction(async (tx) => {
            const updated = await tx.expert_monitoring_records.update({
                where: { id: monitoringId },
                data: {
                    status: 'COMPLETED',
                    performed_date: performedDate!,
                    assessor_user_id: record.assessor_user_id ?? actorId,
                    result,
                    score,
                    summary: this.nullableText(dto.summary),
                    finding: this.nullableText(dto.finding),
                    required_action: this.nullableText(dto.required_action),
                    next_monitoring_date: nextMonitoringDate,
                    completed_by: actorId,
                },
            });

            if (witnessItems.length > 0) {
                await tx.expert_witness_assessment_items.createMany({
                    data: witnessItems.map((item) => ({
                        monitoring_id: monitoringId,
                        criterion_code: item.criterion_code.trim().toUpperCase(),
                        criterion_label: item.criterion_label.trim(),
                        rating: item.rating,
                        comment: this.nullableText(item.comment),
                    })),
                });
            }

            return tx.expert_monitoring_records.findUniqueOrThrow({
                where: { id: monitoringId },
                include: { witness_items: true },
            });
        });
    }

    async cancelMonitoring(
        expertId: string,
        monitoringId: string,
        reason: string,
        actorId: string,
    ) {
        const record = await this.prisma.expert_monitoring_records.findFirst({
            where: { id: monitoringId, expert_id: expertId },
        });
        if (!record) {
            throw new NotFoundException('Không tìm thấy hồ sơ giám sát năng lực');
        }
        if (record.status === 'COMPLETED') {
            throw new BadRequestException(
                'Không thể hủy hồ sơ giám sát đã hoàn tất',
            );
        }
        if (record.status === 'CANCELLED') return record;

        return this.prisma.expert_monitoring_records.update({
            where: { id: monitoringId },
            data: {
                status: 'CANCELLED',
                cancelled_by: actorId,
                cancelled_at: new Date(),
                cancellation_reason: reason.trim(),
            },
        });
    }

    getResourceCustomers() {
        return this.resourceGovernance.listCustomers();
    }

    getResourceGovernance(
        expertId: string,
        startDate?: string,
        endDate?: string,
        includeSensitiveDetails = false,
    ) {
        return this.resourceGovernance.getOverview(
            expertId,
            startDate,
            endDate,
            includeSensitiveDetails,
        );
    }

    createAvailability(
        expertId: string,
        dto: CreateExpertAvailabilityDto,
        actorId: string,
    ) {
        return this.resourceGovernance.createAvailability(expertId, dto, actorId);
    }

    cancelAvailability(
        expertId: string,
        recordId: string,
        dto: CancelExpertResourceRecordDto,
        actorId: string,
    ) {
        return this.resourceGovernance.cancelAvailability(
            expertId,
            recordId,
            dto,
            actorId,
        );
    }

    declareConflict(
        expertId: string,
        dto: CreateExpertCustomerConflictDto,
        actorId: string,
    ) {
        return this.resourceGovernance.declareConflict(expertId, dto, actorId);
    }

    reviewConflict(
        expertId: string,
        conflictId: string,
        dto: ReviewExpertCustomerConflictDto,
        actorId: string,
    ) {
        return this.resourceGovernance.reviewConflict(
            expertId,
            conflictId,
            dto,
            actorId,
        );
    }

    cancelConflict(
        expertId: string,
        conflictId: string,
        dto: CancelExpertResourceRecordDto,
        actorId: string,
    ) {
        return this.resourceGovernance.cancelConflict(
            expertId,
            conflictId,
            dto,
            actorId,
        );
    }

    async recommendForPlan(planId: string, teamRole: string) {
        const requiredRoles = this.resolveCompetencyRoles(teamRole);
        const plan = await this.prisma.audit_plans.findUnique({
            where: { id: planId },
            include: {
                certification_projects: {
                    include: {
                        certification_applications: {
                            include: { customers: true },
                        },
                        industry_scopes: {
                            where: { status: 'APPROVED' },
                            include: {
                                isic_nace_mapping: {
                                    include: { target_code: true },
                                },
                                nace_iaf_mapping: {
                                    include: {
                                        iaf_scope: true,
                                        nace_code: true,
                                    },
                                },
                            },
                        },
                    },
                },
                audit_team_appointment: {
                    select: {
                        id: true,
                        members: {
                            select: {
                                expert_id: true,
                                team_role: true,
                                experts: {
                                    select: {
                                        competencies: {
                                            where: {
                                                approval_status: 'APPROVED',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!plan) {
            throw new NotFoundException('Không tìm thấy kế hoạch đánh giá');
        }

        const standardCode = this.normalizeUpper(
            plan.certification_projects.standard_name,
        );
        const managementSystem = this.resolveManagementSystem(standardCode);
        const startDate = plan.planned_start_date ?? new Date();
        const endDate = plan.planned_end_date ?? startDate;
        const requiredScopes = plan.certification_projects.industry_scopes.map(
            (scope) => ({
                project_scope_id: scope.id,
                management_system: scope.management_system,
                standard_code: scope.standard_code,
                iaf_code: scope.nace_iaf_mapping.iaf_scope.iaf_code,
                iaf_name: scope.nace_iaf_mapping.iaf_scope.iaf_name,
                nace_code: scope.isic_nace_mapping.target_code.code,
                nace_name: scope.isic_nace_mapping.target_code.title_vi ??
                    scope.isic_nace_mapping.target_code.title_en,
                scope_description: scope.scope_description,
            }),
        );
        const customerId = plan.certification_projects
            .certification_applications.customer_id;

        const scopeCoveredBy = (
            competencies: Array<{
                management_system: string;
                standard_code: string;
                competency_role: string;
                scope_level: string;
                iaf_code: string;
                nace_code: string | null;
                effective_date: Date;
                expiry_date: Date | null;
            }>,
            role: string,
            scope: (typeof requiredScopes)[number],
        ) => competencies.some((item) =>
            this.resolveCompetencyRoles(role).includes(this.normalizeUpper(item.competency_role))
            && this.normalizeUpper(item.management_system) === this.normalizeUpper(scope.management_system)
            && this.normalizeUpper(item.standard_code) === this.normalizeUpper(scope.standard_code)
            && item.effective_date <= startDate
            && (!item.expiry_date || item.expiry_date >= endDate)
            && this.normalizeUpper(item.iaf_code) === this.normalizeUpper(scope.iaf_code)
            && (
                this.normalizeUpper(item.scope_level) === 'IAF'
                || this.normalizeUpper(item.nace_code) === this.normalizeUpper(scope.nace_code)
            ),
        );
        const currentMembers = plan.audit_team_appointment?.members ?? [];
        const coveredByCurrentTeam = new Set(requiredScopes.filter((scope) => currentMembers.some(
            (member) => scopeCoveredBy(member.experts.competencies, member.team_role, scope),
        )).map((scope) => scope.project_scope_id));
        const missingBeforeRecommendation = requiredScopes.filter(
            (scope) => !coveredByCurrentTeam.has(scope.project_scope_id),
        );

        const experts = await this.prisma.experts.findMany({
            where: {
                status: 'active',
                profile_status: 'APPROVED',
                user_id: { not: null },
                user_account: { is: { status: 'active' } },
            },
            orderBy: { full_name: 'asc' },
            include: {
                user_account: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        status: true,
                    },
                },
                competencies: {
                    where: {
                        competency_role: { in: requiredRoles },
                        approval_status: 'APPROVED',
                        effective_date: { lte: startDate },
                        OR: [
                            { expiry_date: null },
                            { expiry_date: { gte: endDate } },
                        ],
                        ...(requiredScopes.length ? {
                            AND: [{
                                OR: requiredScopes.map((scope) => ({
                                    management_system: scope.management_system,
                                    standard_code: scope.standard_code,
                                })),
                            }],
                        } : {
                            management_system: managementSystem,
                            standard_code: standardCode,
                        }),
                    },
                },
            },
        });

        const resourceByExpert = await this.resourceGovernance.evaluateMany(
            experts.map((expert) => expert.id),
            startDate,
            endDate,
            {
                customerId,
                includeAssignments: true,
                excludeAppointmentId: plan.audit_team_appointment?.id,
            },
        );

        const priority: Record<string, number> = {
            ELIGIBLE: 1,
            OTHER_COMMITMENT: 2,
            INSUFFICIENT_SCOPE: 3,
            COMPETENCY_NOT_ELIGIBLE: 4,
            DATE_CONFLICT: 5,
            LEAVE: 6,
            UNAVAILABLE: 7,
            INDEPENDENCE_CONFLICT: 8,
        };

        const recommendations = experts.map((expert) => {
            const scopeMatches = requiredScopes.map((scope) => {
                const competency = expert.competencies.find((item) => {
                    const programMatches = this.normalizeUpper(item.management_system) ===
                        this.normalizeUpper(scope.management_system) &&
                        this.normalizeUpper(item.standard_code) ===
                        this.normalizeUpper(scope.standard_code);
                    const iafMatches = this.normalizeUpper(item.iaf_code) ===
                        this.normalizeUpper(scope.iaf_code);
                    const naceMatches = this.normalizeUpper(item.scope_level) === 'IAF' ||
                        this.normalizeUpper(item.nace_code) ===
                        this.normalizeUpper(scope.nace_code);
                    return programMatches && iafMatches && naceMatches;
                });

                return {
                    ...scope,
                    qualified: Boolean(competency),
                    competency_id: competency?.id ?? null,
                };
            });
            const covered = scopeMatches.filter((item) => item.qualified).length;
            const contributedScopes = scopeMatches.filter((item) => item.qualified
                && !coveredByCurrentTeam.has(item.project_scope_id));
            const programAndRole = expert.competencies.length > 0;
            const addsNeededCoverage = missingBeforeRecommendation.length === 0
                || contributedScopes.length > 0;
            const resource = resourceByExpert.get(expert.id)!;
            const eligibilityReasons = [...resource.reasons];

            if (!programAndRole) {
                eligibilityReasons.unshift({
                    code: 'COMPETENCY_NOT_ELIGIBLE',
                    message: 'Chưa có competency hiệu lực phù hợp với chương trình và vai trò.',
                    severity: 'BLOCK' as const,
                });
            }

            if (!addsNeededCoverage) {
                eligibilityReasons.push({
                    code: 'NO_TEAM_COVERAGE_CONTRIBUTION',
                    message: 'Ứng viên không bổ sung phạm vi nào mà đoàn hiện còn thiếu.',
                    severity: 'BLOCK' as const,
                });
            }

            if (currentMembers.some((member) => member.expert_id === expert.id)) {
                eligibilityReasons.push({
                    code: 'ALREADY_ASSIGNED',
                    message: 'Chuyên gia đã thuộc đoàn hiện tại.',
                    severity: 'BLOCK' as const,
                });
            }

            const eligible = programAndRole && addsNeededCoverage && resource.eligible
                && !currentMembers.some((member) => member.expert_id === expert.id);
            const firstBlock = eligibilityReasons.find(
                (reason) => reason.severity === 'BLOCK',
            );
            const firstWarning = eligibilityReasons.find(
                (reason) => reason.severity === 'WARNING',
            );
            const matchStatus = firstBlock?.code ??
                firstWarning?.code ??
                'ELIGIBLE';
            const reasons = eligibilityReasons.length
                ? eligibilityReasons.map((reason) => reason.message)
                : ['Đúng chương trình, vai trò, phạm vi, nguồn lực và independence.'];

            const scoreComponents = {
                role_competency: programAndRole ? 30 : 0,
                missing_coverage_contribution: missingBeforeRecommendation.length
                    ? Math.round(40 * contributedScopes.length / missingBeforeRecommendation.length)
                    : 40,
                resource_eligibility: resource.eligible ? 20 : 0,
                no_warning_bonus: eligibilityReasons.some((reason) => reason.severity === 'WARNING') ? 0 : 10,
            };
            const score = Object.values(scoreComponents).reduce((sum, value) => sum + value, 0);

            return {
                expert: {
                    id: expert.id,
                    user_id: expert.user_id,
                    employee_code: expert.employee_code,
                    full_name: expert.full_name,
                    email: expert.email,
                    phone: expert.phone,
                    account: expert.user_account,
                },
                team_role: this.normalizeUpper(teamRole),
                required_competency_roles: requiredRoles,
                eligible,
                match_status: matchStatus,
                reasons,
                eligibility_reasons: eligibilityReasons,
                checks: {
                    account_linked: Boolean(expert.user_id),
                    profile_approved: expert.profile_status === 'APPROVED',
                    program_and_role: programAndRole,
                    scope_complete: missingBeforeRecommendation.length === contributedScopes.length,
                    adds_needed_team_coverage: addsNeededCoverage,
                    schedule_available: !resource.reasons.some(
                        (reason) => reason.code === 'DATE_CONFLICT',
                    ),
                    availability_available: !resource.reasons.some(
                        (reason) => ['UNAVAILABLE', 'LEAVE'].includes(reason.code),
                    ),
                    independence_eligible: !resource.reasons.some(
                        (reason) => reason.code === 'INDEPENDENCE_CONFLICT',
                    ),
                    capacity_exceeded: resource.workload.capacity_exceeded,
                },
                coverage: {
                    covered,
                    total: requiredScopes.length,
                    currently_missing: missingBeforeRecommendation.length,
                    contribution_count: contributedScopes.length,
                    contribution_scope_ids: contributedScopes.map((scope) => scope.project_scope_id),
                    scopes: scopeMatches,
                },
                availability: {
                    available: resource.eligible,
                    conflicts: resource.assignments,
                    periods: resource.availability_periods.map((period) => ({
                        id: period.id,
                        availability_type: period.availability_type,
                        start_datetime: period.start_datetime,
                        end_datetime: period.end_datetime,
                        status: period.status,
                    })),
                },
                workload: resource.workload,
                score,
                score_components: scoreComponents,
            };
        }).sort((left, right) => {
            if (left.eligible !== right.eligible) return Number(right.eligible) - Number(left.eligible);
            const byStatus = (priority[left.match_status] ?? 20) -
                (priority[right.match_status] ?? 20);
            if (byStatus !== 0) return byStatus;
            if (right.score !== left.score) return right.score - left.score;
            if (left.workload.assigned_mandays !== right.workload.assigned_mandays) {
                return left.workload.assigned_mandays - right.workload.assigned_mandays;
            }
            const byName = left.expert.full_name.localeCompare(
                    right.expert.full_name,
                    'vi',
                );
            return byName || left.expert.id.localeCompare(right.expert.id);
        });

        return {
            plan: {
                id: plan.id,
                plan_code: plan.plan_code,
                standard_code: standardCode,
                management_system: managementSystem,
                planned_start_date: startDate,
                planned_end_date: endDate,
                project_id: plan.project_id,
                project_code: plan.certification_projects.project_code,
                customer_name: plan.certification_projects
                    .certification_applications.customers.company_name,
            },
            required_scopes: requiredScopes,
            team_context: {
                appointment_id: plan.audit_team_appointment?.id ?? null,
                current_member_count: currentMembers.length,
                covered_scope_ids: [...coveredByCurrentTeam],
                missing_scope_ids: missingBeforeRecommendation.map((scope) => scope.project_scope_id),
            },
            recommendations,
        };
    }

    async create(dto: CreateExpertDto) {
        const account = await this.getAccountOrThrow(dto.user_id);
        await this.ensureAccountAvailable(dto.user_id);
        await this.ensureEmployeeCodeAvailable(dto.employee_code);

        return this.prisma.experts.create({
            data: {
                user_id: account.id,
                employee_code: this.nullableText(dto.employee_code),
                full_name: account.full_name?.trim() || account.username,
                email: account.email.trim().toLowerCase(),
                phone: this.nullableText(dto.phone),
                date_of_birth: this.parseDate(dto.date_of_birth, 'Ngày sinh'),
                gender: this.nullableText(dto.gender),
                address: this.nullableText(dto.address),
                employment_type: this.nullableText(dto.employment_type),
                organization: this.nullableText(dto.organization),
                job_title: this.nullableText(dto.job_title),
                education_level: this.nullableText(dto.education_level),
                specialization: this.nullableText(dto.specialization),
                education_summary: this.nullableText(dto.education_summary),
                experience_summary: this.nullableText(dto.experience_summary),
                profile_status: 'DRAFT',
                status: this.normalizeStatus(dto.status) ?? 'active',
            },
        });
    }

    async update(id: string, dto: UpdateExpertDto) {
        const current = await this.getExpertOrThrow(id);
        let account: {
            id: string;
            username: string;
            email: string;
            full_name: string | null;
            status: string | null;
        } | null = null;

        if (dto.user_id !== undefined && dto.user_id !== current.user_id) {
            account = await this.getAccountOrThrow(dto.user_id);
            await this.ensureAccountAvailable(dto.user_id, id);
        }

        await this.ensureEmployeeCodeAvailable(dto.employee_code, id);

        return this.prisma.experts.update({
            where: { id },
            data: {
                ...(dto.user_id !== undefined ? {
                    user_id: dto.user_id,
                    full_name: (account?.full_name?.trim() || account?.username) ?? current.full_name,
                    email: account?.email.trim().toLowerCase() ?? current.email,
                } : {}),
                ...(dto.employee_code !== undefined ? {
                    employee_code: this.nullableText(dto.employee_code),
                } : {}),
                ...(dto.phone !== undefined ? { phone: this.nullableText(dto.phone) } : {}),
                ...(dto.date_of_birth !== undefined ? {
                    date_of_birth: this.parseDate(dto.date_of_birth, 'Ngày sinh'),
                } : {}),
                ...(dto.gender !== undefined ? { gender: this.nullableText(dto.gender) } : {}),
                ...(dto.address !== undefined ? { address: this.nullableText(dto.address) } : {}),
                ...(dto.employment_type !== undefined ? {
                    employment_type: this.nullableText(dto.employment_type),
                } : {}),
                ...(dto.organization !== undefined ? {
                    organization: this.nullableText(dto.organization),
                } : {}),
                ...(dto.job_title !== undefined ? {
                    job_title: this.nullableText(dto.job_title),
                } : {}),
                ...(dto.education_level !== undefined ? {
                    education_level: this.nullableText(dto.education_level),
                } : {}),
                ...(dto.specialization !== undefined ? {
                    specialization: this.nullableText(dto.specialization),
                } : {}),
                ...(dto.education_summary !== undefined ? {
                    education_summary: this.nullableText(dto.education_summary),
                } : {}),
                ...(dto.experience_summary !== undefined ? {
                    experience_summary: this.nullableText(dto.experience_summary),
                } : {}),
                ...(dto.status !== undefined ? {
                    status: this.normalizeStatus(dto.status),
                } : {}),
            },
        });
    }

    async approveProfile(id: string, approvedBy: string) {
        const expert = await this.getExpertOrThrow(id);

        if (!expert.user_id) {
            throw new BadRequestException(
                'Phải liên kết tài khoản trước khi phê duyệt chuyên gia',
            );
        }

        await this.getAccountOrThrow(expert.user_id);

        return this.prisma.experts.update({
            where: { id },
            data: {
                profile_status: 'APPROVED',
                approved_by: approvedBy,
                approved_at: new Date(),
                suspension_reason: null,
                status: 'active',
            },
        });
    }

    async suspendProfile(id: string, approvedBy: string, reason: string) {
        await this.getExpertOrThrow(id);

        return this.prisma.experts.update({
            where: { id },
            data: {
                profile_status: 'SUSPENDED',
                approved_by: approvedBy,
                approved_at: new Date(),
                suspension_reason: reason.trim(),
                status: 'inactive',
            },
        });
    }

    async createWorkExperience(
        expertId: string,
        dto: CreateExpertWorkExperienceDto,
    ) {
        await this.getExpertOrThrow(expertId);
        const startDate = this.parseDate(dto.start_date, 'Ngày bắt đầu');
        const endDate = this.parseDate(dto.end_date, 'Ngày kết thúc');
        this.validateDateRange(startDate, endDate, 'Ngày bắt đầu', 'Ngày kết thúc');

        return this.prisma.expert_work_experiences.create({
            data: {
                expert_id: expertId,
                organization: dto.organization.trim(),
                position: dto.position.trim(),
                start_date: startDate!,
                end_date: endDate,
                industry_codes: this.nullableText(dto.industry_codes),
                responsibility: this.nullableText(dto.responsibility),
                achievement_note: this.nullableText(dto.achievement_note),
            },
        });
    }

    async updateWorkExperience(
        expertId: string,
        recordId: string,
        dto: UpdateExpertWorkExperienceDto,
    ) {
        const record = await this.prisma.expert_work_experiences.findFirst({
            where: { id: recordId, expert_id: expertId },
        });

        if (!record) {
            throw new NotFoundException('Không tìm thấy kinh nghiệm công việc');
        }

        const startDate = dto.start_date
            ? this.parseDate(dto.start_date, 'Ngày bắt đầu')
            : record.start_date;
        const endDate = dto.end_date !== undefined
            ? this.parseDate(dto.end_date, 'Ngày kết thúc')
            : record.end_date;
        this.validateDateRange(startDate, endDate, 'Ngày bắt đầu', 'Ngày kết thúc');

        return this.prisma.expert_work_experiences.update({
            where: { id: recordId },
            data: {
                ...(dto.organization !== undefined ? {
                    organization: dto.organization.trim(),
                } : {}),
                ...(dto.position !== undefined ? { position: dto.position.trim() } : {}),
                ...(dto.start_date !== undefined ? { start_date: startDate! } : {}),
                ...(dto.end_date !== undefined ? { end_date: endDate } : {}),
                ...(dto.industry_codes !== undefined ? {
                    industry_codes: this.nullableText(dto.industry_codes),
                } : {}),
                ...(dto.responsibility !== undefined ? {
                    responsibility: this.nullableText(dto.responsibility),
                } : {}),
                ...(dto.achievement_note !== undefined ? {
                    achievement_note: this.nullableText(dto.achievement_note),
                } : {}),
            },
        });
    }

    async deleteWorkExperience(expertId: string, recordId: string) {
        const record = await this.prisma.expert_work_experiences.findFirst({
            where: { id: recordId, expert_id: expertId },
            select: { id: true },
        });

        if (!record) {
            throw new NotFoundException('Không tìm thấy kinh nghiệm công việc');
        }

        await this.prisma.expert_work_experiences.delete({
            where: { id: recordId },
        });

        return { message: 'Đã xóa kinh nghiệm công việc' };
    }

    async createCertificate(
        expertId: string,
        dto: CreateExpertCertificateDto,
    ) {
        await this.getExpertOrThrow(expertId);
        const issueDate = this.parseDate(dto.issue_date, 'Ngày cấp');
        const expiryDate = this.parseDate(dto.expiry_date, 'Ngày hết hạn');
        this.validateDateRange(issueDate, expiryDate, 'Ngày cấp', 'Ngày hết hạn');

        return this.prisma.expert_certificates.create({
            data: {
                expert_id: expertId,
                certificate_type: this.normalizeUpper(dto.certificate_type),
                certificate_name: dto.certificate_name.trim(),
                certificate_number: this.nullableText(dto.certificate_number),
                issuing_organization: this.nullableText(dto.issuing_organization),
                standard_code: this.nullableText(dto.standard_code),
                issue_date: issueDate,
                expiry_date: expiryDate,
                credential_url: this.nullableText(dto.credential_url),
                note: this.nullableText(dto.note),
            },
        });
    }

    async updateCertificate(
        expertId: string,
        certificateId: string,
        dto: UpdateExpertCertificateDto,
    ) {
        const certificate = await this.prisma.expert_certificates.findFirst({
            where: { id: certificateId, expert_id: expertId },
        });

        if (!certificate) {
            throw new NotFoundException('Không tìm thấy chứng chỉ chuyên gia');
        }

        const issueDate = dto.issue_date !== undefined
            ? this.parseDate(dto.issue_date, 'Ngày cấp')
            : certificate.issue_date;
        const expiryDate = dto.expiry_date !== undefined
            ? this.parseDate(dto.expiry_date, 'Ngày hết hạn')
            : certificate.expiry_date;
        this.validateDateRange(issueDate, expiryDate, 'Ngày cấp', 'Ngày hết hạn');

        return this.prisma.expert_certificates.update({
            where: { id: certificateId },
            data: {
                ...(dto.certificate_type !== undefined ? {
                    certificate_type: this.normalizeUpper(dto.certificate_type),
                } : {}),
                ...(dto.certificate_name !== undefined ? {
                    certificate_name: dto.certificate_name.trim(),
                } : {}),
                ...(dto.certificate_number !== undefined ? {
                    certificate_number: this.nullableText(dto.certificate_number),
                } : {}),
                ...(dto.issuing_organization !== undefined ? {
                    issuing_organization: this.nullableText(dto.issuing_organization),
                } : {}),
                ...(dto.standard_code !== undefined ? {
                    standard_code: this.nullableText(dto.standard_code),
                } : {}),
                ...(dto.issue_date !== undefined ? { issue_date: issueDate } : {}),
                ...(dto.expiry_date !== undefined ? { expiry_date: expiryDate } : {}),
                ...(dto.credential_url !== undefined ? {
                    credential_url: this.nullableText(dto.credential_url),
                } : {}),
                ...(dto.note !== undefined ? { note: this.nullableText(dto.note) } : {}),
            },
        });
    }

    async deleteCertificate(expertId: string, certificateId: string) {
        const certificate = await this.prisma.expert_certificates.findFirst({
            where: { id: certificateId, expert_id: expertId },
            select: { id: true },
        });

        if (!certificate) {
            throw new NotFoundException('Không tìm thấy chứng chỉ chuyên gia');
        }

        await this.prisma.expert_certificates.delete({
            where: { id: certificateId },
        });

        return { message: 'Đã xóa chứng chỉ chuyên gia' };
    }

    async deactivate(id: string) {
        await this.getExpertOrThrow(id);

        const expert = await this.prisma.experts.update({
            where: { id },
            data: { status: 'inactive' },
        });

        return {
            message: 'Đã ngừng hoạt động chuyên gia',
            expert,
        };
    }
}

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateExpertCertificateDto } from './dto/create-expert-certificate.dto';
import { CreateExpertWorkExperienceDto } from './dto/create-expert-work-experience.dto';
import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertCertificateDto } from './dto/update-expert-certificate.dto';
import { UpdateExpertWorkExperienceDto } from './dto/update-expert-work-experience.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';

@Injectable()
export class ExpertsService {
    constructor(
        private readonly prisma: PrismaService,
    ) {}

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
                    expiry_date: true,
                },
            }),
            this.prisma.expert_certificates.count({
                where: {
                    expiry_date: {
                        gte: now,
                        lte: expiryThreshold,
                    },
                },
            }),
        ]);

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
                        item.expiry_date >= now &&
                        item.expiry_date <= expiryThreshold,
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
                    (item) => item.approval_status === 'DRAFT',
                ).length,
                audit_count: expert.audit_team_members.length,
                work_experience_count: expert.work_experiences.length,
                certificate_count: expert.certificates.length,
            },
        };
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
                iaf_code: scope.nace_iaf_mapping.iaf_scope.iaf_code,
                iaf_name: scope.nace_iaf_mapping.iaf_scope.iaf_name,
                nace_code: scope.isic_nace_mapping.target_code.code,
                nace_name: scope.isic_nace_mapping.target_code.title_vi ??
                    scope.isic_nace_mapping.target_code.title_en,
                scope_description: scope.scope_description,
            }),
        );

        const experts = await this.prisma.experts.findMany({
            where: {
                status: 'active',
                profile_status: 'APPROVED',
                user_id: { not: null },
                user_account: { is: { status: 'active' } },
                competencies: {
                    some: {
                        management_system: managementSystem,
                        standard_code: standardCode,
                        competency_role: { in: requiredRoles },
                        approval_status: 'APPROVED',
                        effective_date: { lte: startDate },
                        OR: [
                            { expiry_date: null },
                            { expiry_date: { gte: endDate } },
                        ],
                    },
                },
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
                        management_system: managementSystem,
                        standard_code: standardCode,
                        competency_role: { in: requiredRoles },
                        approval_status: 'APPROVED',
                        effective_date: { lte: startDate },
                        OR: [
                            { expiry_date: null },
                            { expiry_date: { gte: endDate } },
                        ],
                    },
                },
                audit_team_members: {
                    where: {
                        planned_start_date: { lte: endDate },
                        planned_end_date: { gte: startDate },
                        assignment_status: { not: 'cancelled' },
                        audit_team_appointments: {
                            audit_plan_id: { not: planId },
                            status: { in: ['draft', 'issued'] },
                        },
                    },
                    include: {
                        audit_team_appointments: {
                            include: {
                                audit_plans: {
                                    select: {
                                        id: true,
                                        plan_code: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        const priority: Record<string, number> = {
            ELIGIBLE: 1,
            SCHEDULE_CONFLICT: 2,
            INSUFFICIENT_SCOPE: 3,
        };

        const recommendations = experts.map((expert) => {
            const scopeMatches = requiredScopes.map((scope) => {
                const competency = expert.competencies.find((item) => {
                    const iafMatches = this.normalizeUpper(item.iaf_code) ===
                        this.normalizeUpper(scope.iaf_code);
                    const naceMatches = this.normalizeUpper(item.scope_level) === 'IAF' ||
                        this.normalizeUpper(item.nace_code) ===
                        this.normalizeUpper(scope.nace_code);
                    return iafMatches && naceMatches;
                });

                return {
                    ...scope,
                    qualified: Boolean(competency),
                    competency_id: competency?.id ?? null,
                };
            });
            const covered = scopeMatches.filter((item) => item.qualified).length;
            const scopeComplete = requiredScopes.length === 0 ||
                covered === requiredScopes.length;
            const hasConflict = expert.audit_team_members.length > 0;
            const matchStatus = hasConflict
                ? 'SCHEDULE_CONFLICT'
                : scopeComplete
                    ? 'ELIGIBLE'
                    : 'INSUFFICIENT_SCOPE';
            const reasons: string[] = [];

            if (!scopeComplete) {
                reasons.push(
                    `Đáp ứng ${covered}/${requiredScopes.length} phạm vi yêu cầu`,
                );
            }

            if (hasConflict) {
                reasons.push('Trùng lịch với phân công khác');
            }

            if (scopeComplete && !hasConflict) {
                reasons.push('Đúng chương trình, vai trò, phạm vi và không trùng lịch');
            }

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
                match_status: matchStatus,
                reasons,
                checks: {
                    account_linked: Boolean(expert.user_id),
                    profile_approved: expert.profile_status === 'APPROVED',
                    program_and_role: expert.competencies.length > 0,
                    scope_complete: scopeComplete,
                    schedule_available: !hasConflict,
                },
                coverage: {
                    covered,
                    total: requiredScopes.length,
                    scopes: scopeMatches,
                },
                availability: {
                    available: !hasConflict,
                    conflicts: expert.audit_team_members.map((member) => ({
                        plan_id: member.audit_team_appointments.audit_plans.id,
                        plan_code: member.audit_team_appointments.audit_plans.plan_code,
                        start_date: member.planned_start_date,
                        end_date: member.planned_end_date,
                    })),
                },
                competencies: expert.competencies,
            };
        }).sort((left, right) => {
            const byStatus = priority[left.match_status] - priority[right.match_status];
            return byStatus !== 0
                ? byStatus
                : left.expert.full_name.localeCompare(
                    right.expert.full_name,
                    'vi',
                );
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

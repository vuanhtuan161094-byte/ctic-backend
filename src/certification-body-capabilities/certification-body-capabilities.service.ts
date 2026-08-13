import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SecurityAuditService } from '../security/security-audit.service';
import {
    CreateCertificationBodyCapabilityDto,
    UpdateCertificationBodyCapabilityDto,
} from './dto/certification-body-capability.dto';

export type CapabilityResult = 'CAPABLE' | 'REVIEW_REQUIRED' | 'NOT_CAPABLE';

type IndustryScope = {
    isic_code?: string;
    nace_code?: string;
    iaf_code?: string;
    isic_nace_mapping_id?: string;
    nace_iaf_mapping_id?: string;
    management_system?: string;
    scope_description?: string;
    is_primary?: boolean;
};

export type CapabilityEvaluationItem = {
    program_code: string;
    program_name: string;
    iaf_code: string | null;
    result: CapabilityResult;
    reason: string;
    capability: {
        id: string;
        status: string;
        effective_from: Date;
        effective_to: Date | null;
    } | null;
};

export type CapabilityEvaluation = {
    review_id: string;
    evaluated_at: Date;
    overall_result: CapabilityResult;
    items: CapabilityEvaluationItem[];
};

const MANAGEMENT_SYSTEM_PROGRAMS: Record<string, { code: string; name: string }> = {
    QMS: { code: 'ISO_9001', name: 'ISO 9001' },
    EMS: { code: 'ISO_14001', name: 'ISO 14001' },
    OHSMS: { code: 'ISO_45001', name: 'ISO 45001' },
};

export function normalizeProgramCode(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (/9001/.test(normalized)) return 'ISO_9001';
    if (/14001/.test(normalized)) return 'ISO_14001';
    if (/45001/.test(normalized)) return 'ISO_45001';
    return normalized
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 100);
}

export function programForManagementSystem(value?: string) {
    return MANAGEMENT_SYSTEM_PROGRAMS[String(value ?? '').trim().toUpperCase()] ?? null;
}

@Injectable()
export class CertificationBodyCapabilitiesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly securityAudit: SecurityAuditService,
    ) { }

    private parseDate(value: string, fieldName: string): Date {
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) {
            throw new BadRequestException(`${fieldName} không hợp lệ`);
        }
        const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
        if (
            result.getUTCFullYear() !== Number(match[1]) ||
            result.getUTCMonth() !== Number(match[2]) - 1 ||
            result.getUTCDate() !== Number(match[3])
        ) {
            throw new BadRequestException(`${fieldName} không hợp lệ`);
        }
        return result;
    }

    private normalizePeriod(effectiveFrom: string, effectiveTo?: string) {
        const from = this.parseDate(effectiveFrom, 'Ngày bắt đầu hiệu lực');
        const to = effectiveTo ? this.parseDate(effectiveTo, 'Ngày kết thúc hiệu lực') : null;
        if (to && to < from) {
            throw new BadRequestException('Ngày kết thúc hiệu lực phải bằng hoặc sau ngày bắt đầu');
        }
        return { from, to };
    }

    async findAll() {
        return this.prisma.certification_body_capabilities.findMany({
            include: { iaf_scope: true },
            orderBy: [
                { program_code: 'asc' },
                { iaf_scope: { iaf_code: 'asc' } },
            ],
        });
    }

    async create(dto: CreateCertificationBodyCapabilityDto, userId: string) {
        const programCode = normalizeProgramCode(dto.program_code);
        if (!programCode) {
            throw new BadRequestException('Chương trình/tiêu chuẩn không hợp lệ');
        }
        const iafScope = await this.prisma.iaf_scopes.findUnique({
            where: { id: dto.iaf_scope_id },
        });
        if (!iafScope?.is_active) {
            throw new BadRequestException('Mã IAF không tồn tại hoặc đã ngừng hoạt động');
        }
        const existing = await this.prisma.certification_body_capabilities.findFirst({
            where: { program_code: programCode, iaf_scope_id: dto.iaf_scope_id },
        });
        if (existing) {
            throw new ConflictException('Năng lực cho chương trình và IAF này đã tồn tại');
        }
        const period = this.normalizePeriod(dto.effective_from, dto.effective_to);
        const capability = await this.prisma.certification_body_capabilities.create({
            data: {
                program_code: programCode,
                program_name: dto.program_name.trim(),
                iaf_scope_id: dto.iaf_scope_id,
                status: dto.status ?? 'ACTIVE',
                effective_from: period.from,
                effective_to: period.to,
                notes: dto.notes?.trim() || null,
                created_by: userId,
                updated_by: userId,
            },
            include: { iaf_scope: true },
        });
        await this.securityAudit.write({
            userId,
            action: 'CB_CAPABILITY_CREATED',
            entityType: 'certification_body_capability',
            entityId: capability.id,
            outcome: 'success',
            statusCode: 201,
        });
        return capability;
    }

    async update(id: string, dto: UpdateCertificationBodyCapabilityDto, userId: string) {
        const current = await this.prisma.certification_body_capabilities.findUnique({
            where: { id },
        });
        if (!current) throw new NotFoundException('Không tìm thấy năng lực tổ chức chứng nhận');

        const iafScopeId = dto.iaf_scope_id ?? current.iaf_scope_id;
        if (dto.iaf_scope_id) {
            const iaf = await this.prisma.iaf_scopes.findUnique({ where: { id: iafScopeId } });
            if (!iaf?.is_active) throw new BadRequestException('Mã IAF không tồn tại hoặc đã ngừng hoạt động');
        }
        const programCode = dto.program_code
            ? normalizeProgramCode(dto.program_code)
            : current.program_code;
        const period = this.normalizePeriod(
            dto.effective_from ?? current.effective_from.toISOString().slice(0, 10),
            dto.effective_to === undefined
                ? current.effective_to?.toISOString().slice(0, 10)
                : dto.effective_to,
        );
        const duplicate = await this.prisma.certification_body_capabilities.findFirst({
            where: {
                program_code: programCode,
                iaf_scope_id: iafScopeId,
                id: { not: id },
            },
        });
        if (duplicate) throw new ConflictException('Năng lực cho chương trình và IAF này đã tồn tại');

        const capability = await this.prisma.certification_body_capabilities.update({
            where: { id },
            data: {
                program_code: programCode,
                program_name: dto.program_name?.trim(),
                iaf_scope_id: iafScopeId,
                status: dto.status,
                effective_from: period.from,
                effective_to: period.to,
                notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
                updated_by: userId,
            },
            include: { iaf_scope: true },
        });
        await this.securityAudit.write({
            userId,
            action: 'CB_CAPABILITY_UPDATED',
            entityType: 'certification_body_capability',
            entityId: capability.id,
            outcome: 'success',
            statusCode: 200,
        });
        return capability;
    }

    private requestedPrograms(standardName: string) {
        const known = Object.values(MANAGEMENT_SYSTEM_PROGRAMS).filter((program) =>
            standardName.includes(program.code.replace('ISO_', '')),
        );
        if (known.length) return known;
        const fragments = standardName.split(/[+,;]/).map((item) => item.trim()).filter(Boolean);
        return fragments.map((name) => ({ code: normalizeProgramCode(name), name }));
    }

    private parseScopes(value: string | null): IndustryScope[] | null {
        if (!value) return null;
        try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed as IndustryScope[] : null;
        } catch {
            return null;
        }
    }

    async evaluateReview(reviewId: string, at = new Date()): Promise<CapabilityEvaluation> {
        const review = await this.prisma.application_reviews.findUnique({
            where: { id: reviewId },
            include: {
                certification_applications: { select: { standard_name: true } },
            },
        });
        if (!review) throw new NotFoundException('Không tìm thấy bản xem xét đăng ký');

        const programs = this.requestedPrograms(review.certification_applications.standard_name.toUpperCase());
        const scopes = this.parseScopes(review.industry_scopes_json);
        const items: CapabilityEvaluationItem[] = [];

        if (!programs.length || !scopes?.length) {
            return {
                review_id: reviewId,
                evaluated_at: at,
                overall_result: 'REVIEW_REQUIRED',
                items: [{
                    program_code: programs[0]?.code ?? 'UNRESOLVED',
                    program_name: programs[0]?.name ?? review.certification_applications.standard_name,
                    iaf_code: null,
                    result: 'REVIEW_REQUIRED',
                    reason: 'Chưa có đầy đủ phân loại ISIC → NACE → IAF cho phạm vi đăng ký',
                    capability: null,
                }],
            };
        }

        const requiredPairs = new Map<string, { program: { code: string; name: string }; iafCode: string }>();
        for (const program of programs) {
            const matchingScopes = scopes.filter((scope) =>
                programForManagementSystem(scope.management_system)?.code === program.code,
            );
            if (!matchingScopes.length) {
                items.push({
                    program_code: program.code,
                    program_name: program.name,
                    iaf_code: null,
                    result: 'REVIEW_REQUIRED',
                    reason: `Chưa xác định phạm vi ngành cho ${program.name}`,
                    capability: null,
                });
                continue;
            }
            for (const scope of matchingScopes) {
                if (
                    !scope.isic_code?.trim() || !scope.nace_code?.trim() || !scope.iaf_code?.trim() ||
                    !scope.isic_nace_mapping_id || !scope.nace_iaf_mapping_id
                ) {
                    items.push({
                        program_code: program.code,
                        program_name: program.name,
                        iaf_code: scope.iaf_code?.trim() || null,
                        result: 'REVIEW_REQUIRED',
                        reason: 'Phân loại ngành chưa đầy đủ hoặc chưa được xác nhận',
                        capability: null,
                    });
                    continue;
                }
                const iafCode = scope.iaf_code.trim();
                requiredPairs.set(`${program.code}:${iafCode}`, { program, iafCode });
            }
        }

        if (requiredPairs.size) {
            const pairs = [...requiredPairs.values()];
            const capabilities = await this.prisma.certification_body_capabilities.findMany({
                where: {
                    program_code: { in: [...new Set(pairs.map((pair) => pair.program.code))] },
                    iaf_scope: { iaf_code: { in: [...new Set(pairs.map((pair) => pair.iafCode))] } },
                },
                include: { iaf_scope: true },
            });
            const date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
            for (const pair of pairs) {
                const capability = capabilities.find((candidate) =>
                    candidate.program_code === pair.program.code &&
                    candidate.iaf_scope.iaf_code === pair.iafCode,
                ) ?? null;
                const valid = Boolean(
                    capability &&
                    capability.status === 'ACTIVE' &&
                    capability.effective_from <= date &&
                    (!capability.effective_to || capability.effective_to >= date),
                );
                items.push({
                    program_code: pair.program.code,
                    program_name: pair.program.name,
                    iaf_code: pair.iafCode,
                    result: valid ? 'CAPABLE' : 'NOT_CAPABLE',
                    reason: valid
                        ? 'Có năng lực đang hiệu lực cho chương trình và mã IAF'
                        : 'Không có năng lực ACTIVE đang hiệu lực cho chương trình và mã IAF',
                    capability: capability ? {
                        id: capability.id,
                        status: capability.status,
                        effective_from: capability.effective_from,
                        effective_to: capability.effective_to,
                    } : null,
                });
            }
        }

        const overall: CapabilityResult = items.some((item) => item.result === 'REVIEW_REQUIRED')
            ? 'REVIEW_REQUIRED'
            : items.some((item) => item.result === 'NOT_CAPABLE')
                ? 'NOT_CAPABLE'
                : items.length
                    ? 'CAPABLE'
                    : 'REVIEW_REQUIRED';
        return { review_id: reviewId, evaluated_at: at, overall_result: overall, items };
    }

    snapshotData(
        evaluation: CapabilityEvaluation,
        evaluatorId: string,
        approvalVersion = 1,
    ) {
        return evaluation.items.map((item) => ({
            review_id: evaluation.review_id,
            capability_id: item.capability?.id ?? null,
            program_code: item.program_code,
            program_name: item.program_name,
            iaf_code: item.iaf_code ?? 'UNRESOLVED',
            result: item.result,
            reason: item.reason,
            capability_status: item.capability?.status ?? null,
            capability_effective_from: item.capability?.effective_from ?? null,
            capability_effective_to: item.capability?.effective_to ?? null,
            evaluated_at: evaluation.evaluated_at,
            evaluated_by: evaluatorId,
            approval_version: approvalVersion,
        }));
    }

    async assertApplicationApprovedForContract(
        applicationId: string,
        auditAction = 'CONTRACT_PROGRESSION_DENIED',
    ) {
        const review = await this.prisma.application_reviews.findFirst({
            where: { application_id: applicationId },
            orderBy: [
                { created_at: 'desc' },
                { id: 'desc' },
            ],
        });
        if (!review || review.workflow_status !== 'APPROVED') {
            await this.securityAudit.write({
                action: auditAction,
                entityType: 'certification_application',
                entityId: applicationId,
                outcome: 'blocked',
                statusCode: 400,
            });
            throw new BadRequestException(
                'Chỉ được tạo hợp đồng/hồ sơ khi Application Review đã được reviewer phê duyệt',
            );
        }
        return review;
    }
}

import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAuditService } from '../security/security-audit.service';
import {
    CreateCertificationBodyCapabilityBatchDto,
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

type RequestedProgram = {
    code: string;
    name: string;
    edition: string | null;
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

const MANAGEMENT_SYSTEM_PROGRAMS: Record<string, { code: string; name: string; digits: string }> = {
    QMS: { code: 'ISO_9001', name: 'ISO 9001', digits: '9001' },
    EMS: { code: 'ISO_14001', name: 'ISO 14001', digits: '14001' },
    OHSMS: { code: 'ISO_45001', name: 'ISO 45001', digits: '45001' },
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
    const program = MANAGEMENT_SYSTEM_PROGRAMS[String(value ?? '').trim().toUpperCase()] ?? null;
    return program ? { code: program.code, name: program.name } : null;
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

    private async getStandardEdition(id: string) {
        const standard = await this.prisma.standard_editions.findUnique({
            where: { id },
            include: { scheme: true },
        });
        if (!standard) {
            throw new BadRequestException('Phiên bản tiêu chuẩn không tồn tại');
        }
        return standard;
    }

    private programFromStandard(standard: { standard_code: string; standard_name: string; edition: string }) {
        const edition = standard.edition.trim();
        const escapedEdition = edition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const normalizedCode = standard.standard_code
            .trim()
            .replace(new RegExp(`\\s*[:\\-/]?\\s*${escapedEdition}$`, 'i'), '')
            .trim() || standard.standard_code.trim();
        return {
            code: normalizeProgramCode(normalizedCode),
            name: edition ? `${normalizedCode}:${edition}` : normalizedCode,
        };
    }

    async findAll() {
        return this.prisma.certification_body_capabilities.findMany({
            include: {
                iaf_scope: true,
                standard_edition: { include: { scheme: true } },
            },
            orderBy: [
                { program_code: 'asc' },
                { iaf_scope: { iaf_code: 'asc' } },
            ],
        });
    }

    async create(dto: CreateCertificationBodyCapabilityDto, userId: string) {
        const standard = dto.standard_edition_id
            ? await this.getStandardEdition(dto.standard_edition_id)
            : null;
        const derivedProgram = standard ? this.programFromStandard(standard) : null;
        const programCode = derivedProgram?.code ?? normalizeProgramCode(dto.program_code);
        const programName = derivedProgram?.name ?? dto.program_name.trim();
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
            where: dto.standard_edition_id
                ? { standard_edition_id: dto.standard_edition_id, iaf_scope_id: dto.iaf_scope_id }
                : { standard_edition_id: null, program_code: programCode, iaf_scope_id: dto.iaf_scope_id },
        });
        if (existing) {
            throw new ConflictException('Năng lực cho tiêu chuẩn và IAF này đã tồn tại');
        }
        const period = this.normalizePeriod(dto.effective_from, dto.effective_to);
        const capability = await this.prisma.certification_body_capabilities.create({
            data: {
                program_code: programCode,
                program_name: programName,
                standard_edition_id: dto.standard_edition_id ?? null,
                iaf_scope_id: dto.iaf_scope_id,
                status: dto.status ?? 'ACTIVE',
                effective_from: period.from,
                effective_to: period.to,
                notes: dto.notes?.trim() || null,
                created_by: userId,
                updated_by: userId,
            },
            include: {
                iaf_scope: true,
                standard_edition: { include: { scheme: true } },
            },
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

    async createBatch(dto: CreateCertificationBodyCapabilityBatchDto, userId: string) {
        const standard = await this.getStandardEdition(dto.standard_edition_id);
        const ids = [...new Set(dto.iaf_scope_ids)];
        const scopes = await this.prisma.iaf_scopes.findMany({
            where: { id: { in: ids }, is_active: true },
            orderBy: { iaf_code: 'asc' },
        });
        if (scopes.length !== ids.length) {
            throw new BadRequestException('Có mã IAF không tồn tại hoặc đã ngừng hoạt động');
        }
        const period = this.normalizePeriod(dto.effective_from, dto.effective_to);
        const program = this.programFromStandard(standard);

        const result = await this.prisma.$transaction(async (tx) => {
            const existing = await tx.certification_body_capabilities.findMany({
                where: {
                    standard_edition_id: dto.standard_edition_id,
                    iaf_scope_id: { in: ids },
                },
                select: { iaf_scope_id: true },
            });
            const existingIds = new Set(existing.map((item) => item.iaf_scope_id));
            const missing = ids.filter((id) => !existingIds.has(id));
            if (missing.length) {
                await tx.certification_body_capabilities.createMany({
                    data: missing.map((iafScopeId) => ({
                        program_code: program.code,
                        program_name: program.name,
                        standard_edition_id: dto.standard_edition_id,
                        iaf_scope_id: iafScopeId,
                        status: dto.status ?? 'ACTIVE',
                        effective_from: period.from,
                        effective_to: period.to,
                        notes: dto.notes?.trim() || null,
                        created_by: userId,
                        updated_by: userId,
                    })),
                });
            }
            const rows = await tx.certification_body_capabilities.findMany({
                where: {
                    standard_edition_id: dto.standard_edition_id,
                    iaf_scope_id: { in: ids },
                },
                include: {
                    iaf_scope: true,
                    standard_edition: { include: { scheme: true } },
                },
                orderBy: { iaf_scope: { iaf_code: 'asc' } },
            });
            return { rows, created_count: missing.length, existing_count: existingIds.size };
        });

        await this.securityAudit.write({
            userId,
            action: 'CB_CAPABILITY_BATCH_CREATED',
            entityType: 'standard_edition',
            entityId: dto.standard_edition_id,
            outcome: 'success',
            statusCode: 201,
        });
        return result;
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

        const standardEditionId = dto.standard_edition_id ?? current.standard_edition_id;
        const standard = standardEditionId ? await this.getStandardEdition(standardEditionId) : null;
        const derivedProgram = standard ? this.programFromStandard(standard) : null;
        const programCode = derivedProgram?.code ?? (dto.program_code
            ? normalizeProgramCode(dto.program_code)
            : current.program_code);
        const programName = derivedProgram?.name ?? dto.program_name?.trim() ?? current.program_name;
        const period = this.normalizePeriod(
            dto.effective_from ?? current.effective_from.toISOString().slice(0, 10),
            dto.effective_to === undefined
                ? current.effective_to?.toISOString().slice(0, 10)
                : dto.effective_to,
        );
        const duplicate = await this.prisma.certification_body_capabilities.findFirst({
            where: {
                ...(standardEditionId
                    ? { standard_edition_id: standardEditionId, iaf_scope_id: iafScopeId }
                    : { standard_edition_id: null, program_code: programCode, iaf_scope_id: iafScopeId }),
                id: { not: id },
            },
        });
        if (duplicate) throw new ConflictException('Năng lực cho tiêu chuẩn và IAF này đã tồn tại');

        const capability = await this.prisma.certification_body_capabilities.update({
            where: { id },
            data: {
                program_code: programCode,
                program_name: programName,
                standard_edition_id: standardEditionId,
                iaf_scope_id: iafScopeId,
                status: dto.status,
                effective_from: period.from,
                effective_to: period.to,
                notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
                updated_by: userId,
            },
            include: {
                iaf_scope: true,
                standard_edition: { include: { scheme: true } },
            },
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

    private requestedPrograms(standardName: string): RequestedProgram[] {
        const known: RequestedProgram[] = [];
        for (const program of Object.values(MANAGEMENT_SYSTEM_PROGRAMS)) {
            const match = standardName.match(new RegExp(`${program.digits}\\s*(?::|[-])?\\s*((?:19|20)\\d{2})?`, 'i'));
            if (!match) continue;
            known.push({
                code: program.code,
                name: program.name,
                edition: match[1] || null,
            });
        }
        if (known.length) return known;
        const fragments = standardName.split(/[+,;]/).map((item) => item.trim()).filter(Boolean);
        return fragments.map((name) => {
            const edition = name.match(/(?:19|20)\d{2}/)?.[0] ?? null;
            return { code: normalizeProgramCode(name), name, edition };
        });
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

    private capabilityMatchesEdition(
        capability: {
            program_code: string;
            standard_edition_id?: string | null;
            standard_edition?: { standard_code: string; edition: string } | null;
        },
        program: RequestedProgram,
    ) {
        if (!program.edition) return true;
        return Boolean(
            capability.standard_edition &&
            normalizeProgramCode(capability.standard_edition.standard_code) === program.code &&
            capability.standard_edition.edition.trim() === program.edition,
        );
    }

    async evaluateSelection(
        standardName: string,
        scopes: IndustryScope[] | null,
        at = new Date(),
    ): Promise<Omit<CapabilityEvaluation, 'review_id'>> {
        const programs = this.requestedPrograms(standardName.toUpperCase());
        const items: CapabilityEvaluationItem[] = [];

        if (!programs.length || !scopes?.length) {
            return {
                evaluated_at: at,
                overall_result: 'REVIEW_REQUIRED',
                items: [{
                    program_code: programs[0]?.code ?? 'UNRESOLVED',
                    program_name: programs[0]?.name ?? standardName,
                    iaf_code: null,
                    result: 'REVIEW_REQUIRED',
                    reason: 'Chưa có đầy đủ phân loại ISIC → NACE → IAF cho phạm vi đăng ký',
                    capability: null,
                }],
            };
        }

        const requiredPairs = new Map<string, { program: RequestedProgram; iafCode: string }>();
        for (const program of programs) {
            const matchingScopes = scopes.filter((scope) =>
                programForManagementSystem(scope.management_system)?.code === program.code,
            );
            if (!matchingScopes.length) {
                items.push({
                    program_code: program.code,
                    program_name: program.edition ? `${program.name}:${program.edition}` : program.name,
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
                        program_name: program.edition ? `${program.name}:${program.edition}` : program.name,
                        iaf_code: scope.iaf_code?.trim() || null,
                        result: 'REVIEW_REQUIRED',
                        reason: 'Phân loại ngành chưa đầy đủ hoặc chưa được xác nhận',
                        capability: null,
                    });
                    continue;
                }
                const iafCode = scope.iaf_code.trim();
                requiredPairs.set(`${program.code}:${program.edition ?? '*'}:${iafCode}`, { program, iafCode });
            }
        }

        if (requiredPairs.size) {
            const pairs = [...requiredPairs.values()];
            const capabilities = await this.prisma.certification_body_capabilities.findMany({
                where: {
                    program_code: { in: [...new Set(pairs.map((pair) => pair.program.code))] },
                    iaf_scope: { iaf_code: { in: [...new Set(pairs.map((pair) => pair.iafCode))] } },
                },
                include: {
                    iaf_scope: true,
                    standard_edition: true,
                },
            });
            const date = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
            for (const pair of pairs) {
                const sameProgramAndIaf = capabilities.filter((candidate) =>
                    candidate.program_code === pair.program.code &&
                    candidate.iaf_scope.iaf_code === pair.iafCode,
                );
                const exactEdition = pair.program.edition
                    ? sameProgramAndIaf.filter((candidate) => this.capabilityMatchesEdition(candidate, pair.program))
                    : [];
                const legacy = sameProgramAndIaf.filter((candidate) => !candidate.standard_edition_id);
                const pool = exactEdition.length
                    ? exactEdition
                    : pair.program.edition
                        ? legacy
                        : sameProgramAndIaf;
                const capability = pool.find((candidate) =>
                    candidate.status === 'ACTIVE' &&
                    candidate.effective_from <= date &&
                    (!candidate.effective_to || candidate.effective_to >= date),
                ) ?? pool[0] ?? null;
                const valid = Boolean(
                    capability &&
                    capability.status === 'ACTIVE' &&
                    capability.effective_from <= date &&
                    (!capability.effective_to || capability.effective_to >= date),
                );
                const programLabel = pair.program.edition
                    ? `${pair.program.name}:${pair.program.edition}`
                    : pair.program.name;
                items.push({
                    program_code: pair.program.code,
                    program_name: programLabel,
                    iaf_code: pair.iafCode,
                    result: valid ? 'CAPABLE' : 'NOT_CAPABLE',
                    reason: valid
                        ? `Có năng lực đang hiệu lực cho ${programLabel} và IAF ${pair.iafCode}`
                        : `Không có năng lực đang hiệu lực cho ${programLabel} và IAF ${pair.iafCode}`,
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
        return { evaluated_at: at, overall_result: overall, items };
    }

    async evaluateReview(reviewId: string, at = new Date()): Promise<CapabilityEvaluation> {
        const review = await this.prisma.application_reviews.findUnique({
            where: { id: reviewId },
            include: {
                certification_applications: { select: { standard_name: true } },
            },
        });
        if (!review) throw new NotFoundException('Không tìm thấy bản xem xét đăng ký');
        return {
            review_id: reviewId,
            ...await this.evaluateSelection(
                review.certification_applications.standard_name,
                this.parseScopes(review.industry_scopes_json),
                at,
            ),
        };
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

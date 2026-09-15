import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityAuditService } from '../security/security-audit.service';
import {
    CancelScheduledNumberingSeriesDto,
    CreateNumberingSeriesDto,
    CreateSchemeConfigurationDto,
    CreateSchemeDto,
    CreateStandardEditionDto,
    EndNumberingSeriesDto,
    OrganizationProfileDto,
    ReplaceNumberingSeriesDto,
    UpdateSchemeDto,
    UpdateStandardEditionDto,
} from './dto/master-data-configuration.dto';
import {
    isConfigurableNumberingEntity,
    MANDATORY_NUMBERING_ENTITY_TYPES,
    NUMBERING_CAPABILITIES,
    numberingBusinessDate,
    numberingCapabilities,
    numberingRuleLifecycleState,
    numberingSequenceNamespace,
} from './numbering-runtime-policy';
import { TAXONOMY_OPERATIONAL_REVISIONS, TAXONOMY_MANAGEMENT_SYSTEMS, TAXONOMY_MAPPING_TYPES, TaxonomyRuntimePolicyService } from '../industry-classifications/taxonomy-runtime-policy.service';

type CsvRow = Record<string, string>;
type ValidatedRow = {
    rowNumber: number;
    raw: CsvRow;
    normalized: CsvRow | null;
    status: 'VALID' | 'INVALID' | 'DUPLICATE';
    errors: string[];
    warnings: string[];
};

const IMPORT_DEFINITIONS: Record<string, string[]> = {
    SCHEME: ['code', 'name', 'description', 'effective_from', 'effective_to'],
    STANDARD_EDITION: ['scheme_code', 'standard_code', 'standard_name', 'edition', 'effective_from'],
    IAF_SCOPE: ['iaf_code', 'iaf_name', 'description'],
    INDUSTRY_CLASSIFICATION: ['classification_type', 'revision', 'code', 'title_en', 'title_vi', 'parent_code', 'level', 'valid_from', 'valid_to'],
    ISIC_NACE_MAPPING: ['isic_revision', 'isic_code', 'nace_revision', 'nace_code', 'mapping_type', 'note', 'valid_from', 'valid_to'],
    NACE_IAF_MAPPING: ['nace_revision', 'nace_code', 'iaf_code', 'management_system', 'source_document', 'valid_from', 'valid_to'],
};

@Injectable()
export class MasterDataConfigurationService {
    private readonly taxonomyPolicy: TaxonomyRuntimePolicyService;

    constructor(
        private readonly prisma: PrismaService,
        private readonly audit: SecurityAuditService,
        @Optional()
        taxonomyPolicy?: TaxonomyRuntimePolicyService,
    ) {
        this.taxonomyPolicy = taxonomyPolicy ??
            new TaxonomyRuntimePolicyService(prisma);
    }

    private code(value: string, max = 100) {
        return value.trim().toUpperCase().slice(0, max);
    }

    private text(value?: string) {
        return value?.trim() || null;
    }

    private date(value: string | undefined, field: string, required = false) {
        if (!value) {
            if (required) throw new BadRequestException(`${field} là bắt buộc`);
            return null;
        }
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
        if (!match) throw new BadRequestException(`${field} phải theo định dạng YYYY-MM-DD`);
        const result = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
        if (result.toISOString().slice(0, 10) !== value.trim()) {
            throw new BadRequestException(`${field} không hợp lệ`);
        }
        return result;
    }

    private period(from: Date | null, to: Date | null) {
        if (from && to && to < from) {
            throw new BadRequestException('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu');
        }
    }

    private async writeAudit(
        userId: string,
        action: string,
        entityType: string,
        entityId: string,
        statusCode = 200,
        details?: Record<string, unknown>,
    ) {
        await this.audit.write({
            userId, action, entityType, entityId, outcome: 'success', statusCode, details,
        });
    }

    private numberingEntity(value: string) {
        const entityType = this.code(value, 50);
        if (!isConfigurableNumberingEntity(entityType)) {
            throw new BadRequestException(
                'Loại hồ sơ không dùng Numbering Rules. Đơn đăng ký và Chứng chỉ giữ cơ chế cấp số riêng.',
            );
        }
        return entityType;
    }

    private numberingLifecycleReason(value: string) {
        const reason = value.trim();
        if (!reason) {
            throw new BadRequestException('Lý do thay đổi không được để trống');
        }
        return reason;
    }

    private numberingOverlapWhere(
        entityType: string,
        from: Date,
        to: Date | null,
        excludeId?: string,
    ) {
        return {
            entity_type: entityType,
            status: 'ACTIVE',
            ...(excludeId ? { id: { not: excludeId } } : {}),
            effective_from: {
                lte: to ?? new Date('9999-12-31T00:00:00.000Z'),
            },
            OR: [
                { effective_to: null },
                { effective_to: { gte: from } },
            ],
        };
    }

    private async lockNumberingEntity(
        tx: Prisma.TransactionClient,
        entityType: string,
    ) {
        await tx.$queryRaw(Prisma.sql`
            SELECT [id]
            FROM [dbo].[numbering_series_configs] WITH (UPDLOCK, HOLDLOCK)
            WHERE [entity_type] = ${entityType}
        `);
    }

    private publicNumberingRule<TRow extends {
        series_key: string;
        prefix: string;
        status: string;
        effective_from: Date;
        effective_to: Date | null;
    }>(row: TRow, at = numberingBusinessDate()) {
        const { series_key: persistedSeriesKey, ...publicRow } = row;
        const runtimeSeriesKey = numberingSequenceNamespace(row.prefix);
        return {
            ...publicRow,
            runtime_series_key: runtimeSeriesKey,
            legacy_series_key_mismatch:
                persistedSeriesKey !== runtimeSeriesKey,
            lifecycle_state: numberingRuleLifecycleState(row, at),
        };
    }

    async listSchemes(search?: string, activeOnly = false) {
        const now = new Date();
        return this.prisma.certification_schemes.findMany({
            where: {
                ...(activeOnly ? {
                    status: 'ACTIVE',
                    AND: [
                        { OR: [{ effective_from: null }, { effective_from: { lte: now } }] },
                        { OR: [{ effective_to: null }, { effective_to: { gte: now } }] },
                    ],
                } : {}),
                ...(search?.trim() ? {
                    OR: [
                        { code: { contains: search.trim() } },
                        { name: { contains: search.trim() } },
                    ],
                } : {}),
            },
            include: { _count: { select: { standards: true, configurations: true } } },
            orderBy: { code: 'asc' },
            take: 200,
        });
    }

    async createScheme(dto: CreateSchemeDto, userId: string) {
        const code = this.code(dto.code);
        const from = this.date(dto.effective_from, 'Ngày hiệu lực');
        const to = this.date(dto.effective_to, 'Ngày hết hiệu lực');
        this.period(from, to);
        const duplicate = await this.prisma.certification_schemes.findUnique({ where: { code } });
        if (duplicate) throw new ConflictException('Mã scheme/program đã tồn tại');
        const row = await this.prisma.certification_schemes.create({
            data: {
                code, name: dto.name.trim(), description: this.text(dto.description),
                status: dto.status ?? 'ACTIVE', effective_from: from, effective_to: to,
                accreditation_metadata: this.text(dto.accreditation_metadata),
                created_by: userId, updated_by: userId,
            },
        });
        await this.writeAudit(userId, 'MASTER_SCHEME_CREATED', 'certification_scheme', row.id, 201);
        return row;
    }

    async updateScheme(id: string, dto: UpdateSchemeDto, userId: string) {
        const current = await this.prisma.certification_schemes.findUnique({ where: { id } });
        if (!current) throw new NotFoundException('Không tìm thấy scheme/program');
        const code = dto.code ? this.code(dto.code) : current.code;
        const duplicate = await this.prisma.certification_schemes.findFirst({ where: { code, id: { not: id } } });
        if (duplicate) throw new ConflictException('Mã scheme/program đã tồn tại');
        const from = dto.effective_from === undefined ? current.effective_from : this.date(dto.effective_from, 'Ngày hiệu lực');
        const to = dto.effective_to === undefined ? current.effective_to : this.date(dto.effective_to, 'Ngày hết hiệu lực');
        this.period(from, to);
        const row = await this.prisma.certification_schemes.update({
            where: { id },
            data: {
                code, name: dto.name?.trim(), description: dto.description === undefined ? undefined : this.text(dto.description),
                status: dto.status, effective_from: from, effective_to: to,
                accreditation_metadata: dto.accreditation_metadata === undefined ? undefined : this.text(dto.accreditation_metadata),
                updated_by: userId,
            },
        });
        await this.writeAudit(userId, 'MASTER_SCHEME_UPDATED', 'certification_scheme', id);
        return row;
    }

    async listStandards(search?: string, selectable = false) {
        const now = new Date();
        return this.prisma.standard_editions.findMany({
            where: {
                ...(selectable ? {
                    status: 'ACTIVE', effective_from: { lte: now },
                    OR: [{ withdrawn_at: null }, { withdrawn_at: { gt: now } }],
                    scheme: { status: 'ACTIVE' },
                } : {}),
                ...(search?.trim() ? {
                    AND: [{ OR: [
                        { standard_code: { contains: search.trim() } },
                        { standard_name: { contains: search.trim() } },
                        { edition: { contains: search.trim() } },
                    ] }],
                } : {}),
            },
            include: { scheme: true },
            orderBy: [{ standard_code: 'asc' }, { effective_from: 'desc' }],
            take: 300,
        });
    }

    async createStandard(dto: CreateStandardEditionDto, userId: string) {
        const scheme = await this.prisma.certification_schemes.findUnique({ where: { id: dto.scheme_id } });
        if (!scheme) throw new BadRequestException('Scheme/program không tồn tại');
        const standardCode = this.code(dto.standard_code);
        const edition = dto.edition.trim();
        const duplicate = await this.prisma.standard_editions.findFirst({ where: { standard_code: standardCode, edition } });
        if (duplicate) throw new ConflictException('Edition của tiêu chuẩn đã tồn tại');
        const from = this.date(dto.effective_from, 'Ngày hiệu lực', true)!;
        const withdrawn = this.date(dto.withdrawn_at, 'Ngày thu hồi');
        this.period(from, withdrawn);
        if (dto.superseded_by_id) await this.assertStandard(dto.superseded_by_id);
        const row = await this.prisma.standard_editions.create({
            data: {
                scheme_id: dto.scheme_id, standard_code: standardCode, standard_name: dto.standard_name.trim(),
                edition, effective_from: from, withdrawn_at: withdrawn,
                superseded_by_id: dto.superseded_by_id ?? null, status: dto.status ?? 'ACTIVE',
                created_by: userId, updated_by: userId,
            },
            include: { scheme: true },
        });
        await this.writeAudit(userId, 'MASTER_STANDARD_CREATED', 'standard_edition', row.id, 201);
        return row;
    }

    private async assertStandard(id: string) {
        const row = await this.prisma.standard_editions.findUnique({ where: { id } });
        if (!row) throw new BadRequestException('Edition thay thế không tồn tại');
        return row;
    }

    async updateStandard(id: string, dto: UpdateStandardEditionDto, userId: string) {
        const current = await this.assertStandard(id);
        const schemeId = dto.scheme_id ?? current.scheme_id;
        const scheme = await this.prisma.certification_schemes.findUnique({ where: { id: schemeId } });
        if (!scheme) throw new BadRequestException('Scheme/program không tồn tại');
        const standardCode = dto.standard_code ? this.code(dto.standard_code) : current.standard_code;
        const edition = dto.edition?.trim() ?? current.edition;
        const duplicate = await this.prisma.standard_editions.findFirst({
            where: { standard_code: standardCode, edition, id: { not: id } },
        });
        if (duplicate) throw new ConflictException('Edition của tiêu chuẩn đã tồn tại');
        const from = dto.effective_from === undefined ? current.effective_from : this.date(dto.effective_from, 'Ngày hiệu lực', true)!;
        const withdrawn = dto.withdrawn_at === undefined ? current.withdrawn_at : this.date(dto.withdrawn_at, 'Ngày thu hồi');
        this.period(from, withdrawn);
        if (dto.superseded_by_id) {
            if (dto.superseded_by_id === id) throw new BadRequestException('Edition không thể tự thay thế chính nó');
            await this.assertStandard(dto.superseded_by_id);
        }
        const row = await this.prisma.standard_editions.update({
            where: { id },
            data: {
                scheme_id: schemeId, standard_code: standardCode, standard_name: dto.standard_name?.trim(), edition,
                effective_from: from, withdrawn_at: withdrawn,
                superseded_by_id: dto.superseded_by_id === undefined ? undefined : dto.superseded_by_id,
                status: dto.status, updated_by: userId,
            },
            include: { scheme: true },
        });
        await this.writeAudit(userId, 'MASTER_STANDARD_UPDATED', 'standard_edition', id);
        return row;
    }

    async listConfigurations(schemeId?: string) {
        return this.prisma.scheme_configuration_versions.findMany({
            where: schemeId ? { scheme_id: schemeId } : undefined,
            include: { scheme: true },
            orderBy: [{ scheme_id: 'asc' }, { version_no: 'desc' }],
        });
    }

    private previousDay(date: Date) {
        const result = new Date(date);
        result.setUTCDate(result.getUTCDate() - 1);
        return result;
    }

    private async findActiveConfigurationOverlaps(
        schemeId: string,
        effectiveFrom: Date,
        effectiveTo: Date | null,
        excludeId?: string,
    ) {
        return this.prisma.scheme_configuration_versions.findMany({
            where: {
                scheme_id: schemeId,
                status: 'ACTIVE',
                ...(excludeId ? { id: { not: excludeId } } : {}),
                effective_from: { lte: effectiveTo ?? new Date('9999-12-31T00:00:00.000Z') },
                OR: [{ effective_to: null }, { effective_to: { gte: effectiveFrom } }],
            },
            orderBy: { effective_from: 'asc' },
        });
    }

    private ensureConfigurationCanApply(
        versionNo: number,
        effectiveFrom: Date,
        overlaps: Array<{ effective_from: Date }>,
    ) {
        const unsafeOverlap = overlaps.find(
            (item) => item.effective_from.getTime() >= effectiveFrom.getTime(),
        );
        if (unsafeOverlap) {
            throw new ConflictException(
                `Không thể áp dụng v${versionNo}: đã có phiên bản áp dụng bắt đầu từ ${unsafeOverlap.effective_from.toISOString().slice(0, 10)} nằm trong khoảng hiệu lực dự kiến`,
            );
        }
    }

    async createConfiguration(dto: CreateSchemeConfigurationDto, userId: string) {
        const scheme = await this.prisma.certification_schemes.findUnique({ where: { id: dto.scheme_id } });
        if (!scheme) throw new BadRequestException('Scheme/program không tồn tại');
        const from = this.date(dto.effective_from, 'Ngày hiệu lực', true)!;
        const to = this.date(dto.effective_to, 'Ngày hết hiệu lực');
        this.period(from, to);
        const allowedAudits = new Set(['INITIAL_STAGE_1', 'INITIAL_STAGE_2', 'SURVEILLANCE', 'RECERTIFICATION', 'SPECIAL']);
        const allowedDecisions = new Set(['GRANT', 'MAINTAIN', 'RENEW', 'EXTEND_SCOPE', 'REDUCE_SCOPE']);
        const audits = [...new Set(dto.required_audit_types.map((value) => this.code(value, 50)))];
        const decisions = [...new Set(dto.required_decision_types.map((value) => this.code(value, 50)))];
        if (audits.some((value) => !allowedAudits.has(value)) || decisions.some((value) => !allowedDecisions.has(value))) {
            throw new BadRequestException('Audit type hoặc decision type không được hỗ trợ bởi workflow hiện tại');
        }
        if (dto.stage1_applicable && !audits.includes('INITIAL_STAGE_1')) {
            throw new BadRequestException('Chương trình áp dụng Giai đoạn 1 phải chọn đánh giá Chứng nhận lần đầu – Giai đoạn 1');
        }
        if (!dto.stage1_applicable && audits.includes('INITIAL_STAGE_1')) {
            throw new BadRequestException('Đã chọn Không áp dụng Giai đoạn 1 nhưng danh sách loại đánh giá vẫn chứa Giai đoạn 1');
        }
        if (decisions.includes('GRANT') && !audits.includes('INITIAL_STAGE_2')) {
            throw new BadRequestException('Chương trình có quyết định Cấp chứng nhận phải có đánh giá Chứng nhận lần đầu – Giai đoạn 2');
        }
        if (dto.surveillance_frequency_months > dto.cycle_duration_months) {
            throw new BadRequestException('Khoảng giám sát không được dài hơn toàn bộ chu kỳ chứng nhận');
        }
        if (dto.validity_duration_months > dto.cycle_duration_months) {
            throw new BadRequestException('Thời hạn hiệu lực chứng chỉ không được dài hơn chu kỳ chứng nhận');
        }
        const duplicate = await this.prisma.scheme_configuration_versions.findFirst({
            where: { scheme_id: dto.scheme_id, version_no: dto.version_no },
        });
        if (duplicate) throw new ConflictException('Version cấu hình scheme đã tồn tại');

        const overlaps = await this.findActiveConfigurationOverlaps(dto.scheme_id, from, to);
        this.ensureConfigurationCanApply(dto.version_no, from, overlaps);
        const previousEffectiveTo = this.previousDay(from);

        const row = await this.prisma.$transaction(async (tx) => {
            for (const overlap of overlaps) {
                if (previousEffectiveTo < overlap.effective_from) {
                    throw new ConflictException(
                        `Không thể tự đóng v${overlap.version_no}: ngày kết thúc suy ra nằm trước ngày bắt đầu của phiên bản cũ`,
                    );
                }
                await tx.scheme_configuration_versions.update({
                    where: { id: overlap.id },
                    data: { effective_to: previousEffectiveTo },
                });
            }

            return tx.scheme_configuration_versions.create({
                data: {
                    scheme_id: dto.scheme_id,
                    version_no: dto.version_no,
                    status: 'ACTIVE',
                    effective_from: from,
                    effective_to: to,
                    cycle_duration_months: dto.cycle_duration_months,
                    surveillance_frequency_months: dto.surveillance_frequency_months,
                    stage1_applicable: dto.stage1_applicable,
                    validity_duration_months: dto.validity_duration_months,
                    renewal_window_days: dto.renewal_window_days,
                    reminder_lead_days: dto.reminder_lead_days,
                    required_audit_types: audits.join(','),
                    required_decision_types: decisions.join(','),
                    created_by: userId,
                    // Legacy column names are retained for backward-compatible audit metadata.
                    // They mean "applied by/at" for configuration, not an approval workflow.
                    approved_by: userId,
                    approved_at: new Date(),
                },
                include: { scheme: true },
            });
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        await this.writeAudit(
            userId,
            overlaps.length
                ? 'SCHEME_CONFIG_CREATED_APPLIED_AND_PREVIOUS_CLOSED'
                : 'SCHEME_CONFIG_CREATED_AND_APPLIED',
            'scheme_configuration',
            row.id,
            201,
        );
        return {
            ...row,
            previous_versions_closed: overlaps.map((item) => ({
                id: item.id,
                version_no: item.version_no,
                effective_to: previousEffectiveTo,
            })),
        };
    }

    /**
     * Backward-compatibility path for DRAFT rows created before direct-apply configuration.
     * New configurations are created as ACTIVE immediately by createConfiguration().
     */
    async activateConfiguration(id: string, userId: string) {
        const current = await this.prisma.scheme_configuration_versions.findUnique({
            where: { id },
            include: { scheme: true },
        });
        if (!current) throw new NotFoundException('Không tìm thấy version cấu hình');
        if (current.status !== 'DRAFT') throw new ConflictException('Chỉ bản nháp cũ mới cần thao tác Áp dụng');

        const overlaps = await this.findActiveConfigurationOverlaps(
            current.scheme_id,
            current.effective_from,
            current.effective_to,
            id,
        );
        this.ensureConfigurationCanApply(current.version_no, current.effective_from, overlaps);
        const previousEffectiveTo = this.previousDay(current.effective_from);

        const row = await this.prisma.$transaction(async (tx) => {
            for (const overlap of overlaps) {
                if (previousEffectiveTo < overlap.effective_from) {
                    throw new ConflictException(
                        `Không thể tự đóng v${overlap.version_no}: ngày kết thúc suy ra nằm trước ngày bắt đầu của phiên bản cũ`,
                    );
                }
                await tx.scheme_configuration_versions.update({
                    where: { id: overlap.id },
                    data: { effective_to: previousEffectiveTo },
                });
            }

            return tx.scheme_configuration_versions.update({
                where: { id },
                data: {
                    status: 'ACTIVE',
                    // Legacy column names are retained for backward compatibility only.
                    approved_by: userId,
                    approved_at: new Date(),
                },
                include: { scheme: true },
            });
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        await this.writeAudit(
            userId,
            overlaps.length
                ? 'SCHEME_CONFIG_APPLIED_AND_PREVIOUS_CLOSED'
                : 'SCHEME_CONFIG_APPLIED',
            'scheme_configuration',
            id,
        );
        return {
            ...row,
            previous_versions_closed: overlaps.map((item) => ({
                id: item.id,
                version_no: item.version_no,
                effective_to: previousEffectiveTo,
            })),
        };
    }

    async cancelScheduledConfiguration(id: string, userId: string) {
        const current = await this.prisma.scheme_configuration_versions.findUnique({
            where: { id },
            include: { scheme: true },
        });
        if (!current) throw new NotFoundException('Không tìm thấy version cấu hình');
        if (current.status !== 'ACTIVE') {
            throw new ConflictException('Chỉ phiên bản đang chờ hiệu lực mới có thể hủy lịch áp dụng');
        }

        const now = new Date();
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        if (current.effective_from <= today) {
            throw new ConflictException('Phiên bản đã bắt đầu áp dụng. Hãy tạo phiên bản mới để thay thế thay vì hủy lịch');
        }

        const previous = await this.prisma.scheme_configuration_versions.findFirst({
            where: {
                scheme_id: current.scheme_id,
                status: 'ACTIVE',
                id: { not: id },
                effective_from: { lt: current.effective_from },
            },
            orderBy: { effective_from: 'desc' },
        });
        const next = await this.prisma.scheme_configuration_versions.findFirst({
            where: {
                scheme_id: current.scheme_id,
                status: 'ACTIVE',
                id: { not: id },
                effective_from: { gt: current.effective_from },
            },
            orderBy: { effective_from: 'asc' },
        });
        const restoredPreviousEnd = next ? this.previousDay(next.effective_from) : null;

        const row = await this.prisma.$transaction(async (tx) => {
            const retired = await tx.scheme_configuration_versions.update({
                where: { id },
                data: { status: 'RETIRED' },
                include: { scheme: true },
            });
            if (previous) {
                await tx.scheme_configuration_versions.update({
                    where: { id: previous.id },
                    data: { effective_to: restoredPreviousEnd },
                });
            }
            return retired;
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        await this.writeAudit(userId, 'SCHEME_CONFIG_SCHEDULE_CANCELLED', 'scheme_configuration', id);
        return {
            ...row,
            previous_version_restored: previous ? {
                id: previous.id,
                version_no: previous.version_no,
                effective_to: restoredPreviousEnd,
            } : null,
        };
    }

    async resolveConfiguration(schemeCode: string, at?: string) {
        const date = at ? this.date(at, 'Ngày áp dụng', true)! : new Date();
        const scheme = await this.prisma.certification_schemes.findUnique({ where: { code: this.code(schemeCode) } });
        if (!scheme) throw new NotFoundException('Không tìm thấy scheme/program');
        const row = await this.prisma.scheme_configuration_versions.findFirst({
            where: {
                scheme_id: scheme.id, status: 'ACTIVE', effective_from: { lte: date },
                OR: [{ effective_to: null }, { effective_to: { gte: date } }],
            },
            orderBy: [{ effective_from: 'desc' }, { version_no: 'desc' }],
        });
        if (!row) throw new NotFoundException('Không có cấu hình ACTIVE tại ngày yêu cầu');
        return {
            ...row, scheme,
            required_audit_types: row.required_audit_types.split(',').filter(Boolean),
            required_decision_types: row.required_decision_types.split(',').filter(Boolean),
        };
    }

    async configurationReadiness() {
        const now = new Date();
        const numberingToday = numberingBusinessDate(now);
        const [
            schemes,
            profile,
            numbering,
            taxonomy,
        ] = await Promise.all([
            this.prisma.certification_schemes.findMany({
                where: {
                    status: 'ACTIVE',
                    AND: [
                        { OR: [{ effective_from: null }, { effective_from: { lte: now } }] },
                        { OR: [{ effective_to: null }, { effective_to: { gte: now } }] },
                    ],
                },
                include: {
                    standards: {
                        where: {
                            status: 'ACTIVE',
                            effective_from: { lte: now },
                            OR: [{ withdrawn_at: null }, { withdrawn_at: { gt: now } }],
                        },
                        select: {
                            id: true,
                            standard_code: true,
                            edition: true,
                        },
                    },
                    configurations: {
                        where: {
                            status: 'ACTIVE',
                            effective_from: { lte: now },
                            OR: [{ effective_to: null }, { effective_to: { gte: now } }],
                        },
                        select: {
                            id: true,
                            version_no: true,
                            cycle_duration_months: true,
                            surveillance_frequency_months: true,
                            validity_duration_months: true,
                            renewal_window_days: true,
                            reminder_lead_days: true,
                            stage1_applicable: true,
                            required_audit_types: true,
                            required_decision_types: true,
                        },
                        orderBy: [
                            { effective_from: 'desc' },
                            { version_no: 'desc' },
                        ],
                    },
                },
                orderBy: { code: 'asc' },
            }),
            this.prisma.organization_profiles.findUnique({
                where: { profile_key: 'PRIMARY' },
                select: {
                    id: true,
                    legal_name: true,
                    display_name: true,
                    timezone: true,
                    locale: true,
                    certificate_reminder_days: true,
                },
            }),
            this.prisma.numbering_series_configs.findMany({
                where: {
                    status: 'ACTIVE',
                },
                select: {
                    id: true,
                    entity_type: true,
                    series_key: true,
                    prefix: true,
                    padding: true,
                    status: true,
                    effective_from: true,
                    effective_to: true,
                },
            }),
            this.taxonomyPolicy.getReadiness(now),
        ]);

        const currentNumbering = numbering.filter((item) =>
            numberingRuleLifecycleState(item, numberingToday) === 'CURRENT');
        const numberingReasons = NUMBERING_CAPABILITIES.flatMap((capability) => {
            const current = currentNumbering.filter(
                (item) => item.entity_type === capability.entity_type,
            );
            if (current.length === 1) return [];
            const scheduled = numbering.some((item) =>
                item.entity_type === capability.entity_type &&
                numberingRuleLifecycleState(item, numberingToday) === 'SCHEDULED');
            return [{
                code: current.length > 1
                    ? 'NUMBERING_ACTIVE_OVERLAP'
                    : scheduled
                        ? 'NUMBERING_RULE_SCHEDULED_NOT_CURRENT'
                        : 'NUMBERING_RULE_MISSING',
                entity_type: capability.entity_type,
                label: capability.label,
                blocking: capability.mandatory_for_global_readiness,
                message: current.length > 1
                    ? `Có nhiều quy tắc đang hiệu lực cho ${capability.label}.`
                    : scheduled
                        ? `${capability.label} mới có quy tắc chờ hiệu lực, chưa có quy tắc hiện hành.`
                        : `Chưa có quy tắc hiện hành cho ${capability.label}.`,
            }];
        });
        const blockingNumberingReasons = numberingReasons.filter(
            (item) => item.blocking,
        );
        const missingNumbering = blockingNumberingReasons
            .filter((item) => item.code !== 'NUMBERING_ACTIVE_OVERLAP')
            .map((item) => item.entity_type);
        const numberingReady = blockingNumberingReasons.length === 0;
        const schemeRows = schemes.map((scheme) => {
            const activeConfiguration = scheme.configurations[0] ?? null;
            const issues: string[] = [];
            if (!scheme.standards.length) {
                issues.push('Chưa có phiên bản tiêu chuẩn đang hiệu lực');
            }
            if (!activeConfiguration) {
                issues.push('Chưa có phiên bản quy tắc ACTIVE');
            }
            return {
                id: scheme.id,
                code: scheme.code,
                name: scheme.name,
                active_standard_count: scheme.standards.length,
                active_configuration: activeConfiguration,
                status: issues.length ? 'NEEDS_ATTENTION' : 'READY',
                issues,
            };
        });

        const ready =
            Boolean(profile) &&
            taxonomy.ready &&
            schemeRows.length > 0 &&
            schemeRows.every((item) => item.status === 'READY') &&
            numberingReady;

        return {
            status: ready ? 'READY' : 'NEEDS_ATTENTION',
            generated_at: now.toISOString(),
            organization: {
                ready: Boolean(profile),
                profile,
            },
            schemes: {
                ready: schemeRows.length > 0 && schemeRows.every((item) => item.status === 'READY'),
                items: schemeRows,
            },
            taxonomy: {
                ...taxonomy,
            },
            numbering: {
                ready: numberingReady,
                configured: currentNumbering.map((item) =>
                    this.publicNumberingRule(item, numberingToday)),
                missing_entity_types: missingNumbering,
                mandatory_entity_types: [...MANDATORY_NUMBERING_ENTITY_TYPES],
                optional_entity_types: NUMBERING_CAPABILITIES
                    .filter((item) => !item.mandatory_for_global_readiness)
                    .map((item) => item.entity_type),
                reasons: numberingReasons,
            },
            runtime_wiring: [
                {
                    field: 'stage1_applicable',
                    status: 'ENFORCED',
                    effect: 'Gate cấp chứng nhận lần đầu đọc snapshot dự án để quyết định có bắt buộc Giai đoạn 1 hay không.',
                },
                {
                    field: 'surveillance_frequency_months',
                    status: 'ENFORCED',
                    effect: 'Workspace/quyết định lấy khoảng giám sát mặc định từ snapshot dự án.',
                },
                {
                    field: 'validity_duration_months',
                    status: 'ENFORCED',
                    effect: 'Workspace tự đề xuất ngày hết hiệu lực từ ngày hiệu lực và snapshot dự án.',
                },
                {
                    field: 'reminder_lead_days',
                    status: 'ENFORCED',
                    effect: 'Nhắc chứng chỉ sắp hết hạn ưu tiên mốc nhắc từ snapshot dự án; hồ sơ cũ fallback cấu hình tổ chức.',
                },
                {
                    field: 'cycle_duration_months',
                    status: 'SNAPSHOT_ONLY',
                    effect: 'Được kiểm tra tính hợp lệ và snapshot; cấu trúc dossier GS1/GS2 hiện vẫn do workflow code-governed.',
                },
                {
                    field: 'renewal_window_days',
                    status: 'ENFORCED',
                    effect: 'Mốc theo dõi chứng chỉ/tái chứng nhận bắt đầu từ cửa sổ cấu hình; hệ thống vẫn không tự sinh thêm cycle ngoài workflow GS1/GS2 hiện hành.',
                },
                {
                    field: 'required_audit_types',
                    status: 'SNAPSHOT_ONLY',
                    effect: 'Danh mục loại đánh giá được kiểm tra logic và chốt theo dự án. Workflow hiện hành vẫn quyết định hồ sơ/đợt đánh giá nào thực sự được sinh ra.',
                },
                {
                    field: 'required_decision_types',
                    status: 'SNAPSHOT_ONLY',
                    effect: 'Danh mục loại quyết định được chốt để truy vết cấu hình; gate quyết định và phân tách nhiệm vụ vẫn do workflow chứng nhận kiểm soát.',
                },
            ],
        };
    }

    getOrganizationProfile() {
        return this.prisma.organization_profiles.findUnique({ where: { profile_key: 'PRIMARY' } });
    }

    async saveOrganizationProfile(dto: OrganizationProfileDto, userId: string) {
        const data = {
            legal_name: dto.legal_name.trim(), display_name: dto.display_name.trim(), short_name: dto.short_name.trim(),
            logo_reference: this.text(dto.logo_reference), address: this.text(dto.address), email: this.text(dto.email),
            phone: this.text(dto.phone), website: this.text(dto.website), document_footer: this.text(dto.document_footer),
            portal_title: dto.portal_title.trim(), timezone: dto.timezone.trim(), locale: dto.locale.trim(),
            date_format: dto.date_format, default_language: dto.default_language.trim(),
            certificate_reminder_days: dto.certificate_reminder_days,
            file_retention_days: dto.file_retention_days ?? null, updated_by: userId,
        };
        const row = await this.prisma.organization_profiles.upsert({
            where: { profile_key: 'PRIMARY' }, update: data, create: { profile_key: 'PRIMARY', ...data },
        });
        await this.writeAudit(userId, 'ORGANIZATION_PROFILE_UPDATED', 'organization_profile', row.id);
        return row;
    }

    numberingCapabilities() {
        return numberingCapabilities();
    }

    async listNumberingSeries() {
        const at = numberingBusinessDate();
        const rows = await this.prisma.numbering_series_configs.findMany({
            orderBy: [
                { entity_type: 'asc' },
                { effective_from: 'desc' },
            ],
        });
        return rows.map((row) => this.publicNumberingRule(row, at));
    }

    async createNumberingSeries(dto: CreateNumberingSeriesDto, userId: string) {
        const entityType = this.numberingEntity(dto.entity_type);
        const from = this.date(dto.effective_from, 'Ngày hiệu lực', true)!;
        const to = this.date(dto.effective_to, 'Ngày hết hiệu lực');
        this.period(from, to);
        const prefix = numberingSequenceNamespace(dto.prefix);
        const row = await this.prisma.$transaction(async (tx) => {
            await this.lockNumberingEntity(tx, entityType);
            const overlap = await tx.numbering_series_configs.findFirst({
                where: this.numberingOverlapWhere(entityType, from, to),
            });
            if (overlap) {
                throw new ConflictException(
                    'Khoảng hiệu lực chồng lấn quy tắc hiện có. Hãy dùng thao tác Thay thế quy tắc.',
                );
            }
            return tx.numbering_series_configs.create({
                data: {
                    series_key: prefix,
                    entity_type: entityType,
                    prefix,
                    padding: dto.padding,
                    effective_from: from,
                    effective_to: to,
                    created_by: userId,
                },
            });
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        await this.writeAudit(userId, 'NUMBERING_CONFIG_CREATED', 'numbering_series_config', row.id, 201);
        return this.publicNumberingRule(row);
    }

    async replaceNumberingSeries(
        id: string,
        dto: ReplaceNumberingSeriesDto,
        userId: string,
    ) {
        const replacementFrom = this.date(
            dto.effective_from,
            'Ngày bắt đầu quy tắc mới',
            true,
        )!;
        const replacementTo = this.date(
            dto.effective_to,
            'Ngày kết thúc quy tắc mới',
        );
        this.period(replacementFrom, replacementTo);
        const today = numberingBusinessDate();
        if (replacementFrom < today) {
            throw new BadRequestException(
                'Không thể thay đổi lịch sử. Quy tắc mới phải bắt đầu từ hôm nay hoặc một ngày tương lai.',
            );
        }
        const prefix = numberingSequenceNamespace(dto.prefix);
        const reason = this.numberingLifecycleReason(dto.reason);

        const result = await this.prisma.$transaction(async (tx) => {
            const target = await tx.numbering_series_configs.findUnique({
                where: { id },
            });
            if (!target) throw new NotFoundException('Không tìm thấy quy tắc đánh số');
            const entityType = this.numberingEntity(target.entity_type);
            await this.lockNumberingEntity(tx, entityType);
            const lockedTarget = await tx.numbering_series_configs.findUnique({
                where: { id },
            });
            if (!lockedTarget || lockedTarget.status !== 'ACTIVE') {
                throw new ConflictException('Chỉ quy tắc hiện hành mới có thể được thay thế');
            }
            if (numberingRuleLifecycleState(lockedTarget, today) !== 'CURRENT') {
                throw new ConflictException(
                    'Quy tắc đã chọn không còn hiện hành. Hãy tải lại danh sách trước khi thao tác.',
                );
            }
            if (
                lockedTarget.effective_to &&
                replacementFrom > new Date(lockedTarget.effective_to.getTime() + 86_400_000)
            ) {
                throw new BadRequestException(
                    'Ngày bắt đầu quy tắc mới tạo khoảng trống sau quy tắc hiện hành.',
                );
            }
            if (
                replacementFrom.getTime() === lockedTarget.effective_from.getTime() &&
                prefix === numberingSequenceNamespace(lockedTarget.prefix)
            ) {
                throw new ConflictException(
                    'Không thể tạo hai phiên bản cùng tiền tố trong cùng ngày bắt đầu. Hãy chọn ngày kế tiếp để giữ lịch sử.',
                );
            }
            const overlap = await tx.numbering_series_configs.findFirst({
                where: this.numberingOverlapWhere(
                    entityType,
                    replacementFrom,
                    replacementTo,
                    id,
                ),
            });
            if (overlap) {
                throw new ConflictException(
                    'Quy tắc mới chồng lấn một quy tắc hiện hành hoặc đã lên lịch khác.',
                );
            }

            const previousEnd = this.previousDay(replacementFrom);
            const sameStart = previousEnd < lockedTarget.effective_from;
            const previous = await tx.numbering_series_configs.update({
                where: { id },
                data: sameStart
                    ? { status: 'INACTIVE' }
                    : { effective_to: previousEnd },
            });
            const replacement = await tx.numbering_series_configs.create({
                data: {
                    series_key: prefix,
                    entity_type: entityType,
                    prefix,
                    padding: dto.padding,
                    status: 'ACTIVE',
                    effective_from: replacementFrom,
                    effective_to: replacementTo,
                    created_by: userId,
                },
            });
            return { previous, replacement };
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });

        await this.writeAudit(
            userId,
            'NUMBERING_CONFIG_REPLACED',
            'numbering_series_config',
            result.replacement.id,
            201,
            {
                reason,
                previous_rule_id: result.previous.id,
                effective_from: dto.effective_from,
                effective_to: dto.effective_to ?? null,
                runtime_series_key: prefix,
            },
        );
        return {
            rule: this.publicNumberingRule(result.replacement, today),
            previous_rule: this.publicNumberingRule(result.previous, today),
        };
    }

    async endNumberingSeries(
        id: string,
        dto: EndNumberingSeriesDto,
        userId: string,
    ) {
        const endAt = this.date(dto.effective_to, 'Ngày kết thúc', true)!;
        const today = numberingBusinessDate();
        if (endAt < today) {
            throw new BadRequestException('Không thể sửa ngày kết thúc vào quá khứ');
        }
        const reason = this.numberingLifecycleReason(dto.reason);
        const row = await this.prisma.$transaction(async (tx) => {
            const target = await tx.numbering_series_configs.findUnique({ where: { id } });
            if (!target) throw new NotFoundException('Không tìm thấy quy tắc đánh số');
            const entityType = this.numberingEntity(target.entity_type);
            await this.lockNumberingEntity(tx, entityType);
            const lockedTarget = await tx.numbering_series_configs.findUnique({ where: { id } });
            if (
                !lockedTarget ||
                lockedTarget.status !== 'ACTIVE' ||
                numberingRuleLifecycleState(lockedTarget, today) !== 'CURRENT'
            ) {
                throw new ConflictException('Chỉ quy tắc hiện hành mới có thể đặt ngày kết thúc');
            }
            this.period(lockedTarget.effective_from, endAt);
            const next = await tx.numbering_series_configs.findFirst({
                where: {
                    entity_type: entityType,
                    status: 'ACTIVE',
                    id: { not: id },
                    effective_from: { gt: lockedTarget.effective_from },
                },
                orderBy: { effective_from: 'asc' },
            });
            if (next && endAt >= next.effective_from) {
                throw new ConflictException(
                    'Ngày kết thúc chồng lấn quy tắc đã lên lịch tiếp theo.',
                );
            }
            return tx.numbering_series_configs.update({
                where: { id },
                data: { effective_to: endAt },
            });
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        await this.writeAudit(
            userId,
            'NUMBERING_CONFIG_END_SCHEDULED',
            'numbering_series_config',
            id,
            200,
            { reason, effective_to: dto.effective_to },
        );
        return this.publicNumberingRule(row, today);
    }

    async cancelScheduledNumberingSeries(
        id: string,
        dto: CancelScheduledNumberingSeriesDto,
        userId: string,
    ) {
        const today = numberingBusinessDate();
        const reason = this.numberingLifecycleReason(dto.reason);
        const result = await this.prisma.$transaction(async (tx) => {
            const target = await tx.numbering_series_configs.findUnique({ where: { id } });
            if (!target) throw new NotFoundException('Không tìm thấy quy tắc đánh số');
            const entityType = this.numberingEntity(target.entity_type);
            await this.lockNumberingEntity(tx, entityType);
            const lockedTarget = await tx.numbering_series_configs.findUnique({ where: { id } });
            if (
                !lockedTarget ||
                lockedTarget.status !== 'ACTIVE' ||
                numberingRuleLifecycleState(lockedTarget, today) !== 'SCHEDULED'
            ) {
                throw new ConflictException('Chỉ quy tắc đang chờ hiệu lực mới có thể hủy lịch');
            }
            const previous = await tx.numbering_series_configs.findFirst({
                where: {
                    entity_type: entityType,
                    status: 'ACTIVE',
                    id: { not: id },
                    effective_from: { lt: lockedTarget.effective_from },
                },
                orderBy: { effective_from: 'desc' },
            });
            const next = await tx.numbering_series_configs.findFirst({
                where: {
                    entity_type: entityType,
                    status: 'ACTIVE',
                    id: { not: id },
                    effective_from: { gt: lockedTarget.effective_from },
                },
                orderBy: { effective_from: 'asc' },
            });
            const cancelled = await tx.numbering_series_configs.update({
                where: { id },
                data: { status: 'INACTIVE' },
            });
            let restoredPrevious: typeof previous = null;
            if (
                previous?.effective_to &&
                previous.effective_to.getTime() ===
                    this.previousDay(lockedTarget.effective_from).getTime()
            ) {
                const restoredEnd = next
                    ? this.previousDay(next.effective_from)
                    : null;
                if (restoredEnd && restoredEnd < previous.effective_from) {
                    throw new ConflictException(
                        'Không thể khôi phục quy tắc trước mà không tạo chồng lấn.',
                    );
                }
                restoredPrevious = await tx.numbering_series_configs.update({
                    where: { id: previous.id },
                    data: { effective_to: restoredEnd },
                });
            }
            return { cancelled, restoredPrevious };
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
        await this.writeAudit(
            userId,
            'NUMBERING_CONFIG_SCHEDULE_CANCELLED',
            'numbering_series_config',
            id,
            200,
            {
                reason,
                restored_previous_rule_id: result.restoredPrevious?.id ?? null,
            },
        );
        return {
            rule: this.publicNumberingRule(result.cancelled, today),
            previous_rule: result.restoredPrevious
                ? this.publicNumberingRule(result.restoredPrevious, today)
                : null,
        };
    }

    async resolveNumbering(entityType: string, at = new Date()) {
        const normalizedEntityType = this.numberingEntity(entityType);
        const effectiveAt = numberingBusinessDate(at);
        return this.prisma.numbering_series_configs.findFirst({
            where: {
                entity_type: normalizedEntityType,
                status: 'ACTIVE',
                effective_from: { lte: effectiveAt },
                OR: [
                    { effective_to: null },
                    { effective_to: { gte: effectiveAt } },
                ],
            },
            orderBy: { effective_from: 'desc' },
        });
    }

    importDefinitions() {
        return Object.entries(IMPORT_DEFINITIONS).map(([entity_type, columns]) => ({ entity_type, format: 'CSV_UTF8', mode: 'CREATE_ONLY', columns }));
    }

    private parseCsv(buffer: Buffer) {
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); }
        catch { throw new BadRequestException('CSV phải là UTF-8 hợp lệ'); }
        const rows: string[][] = [];
        let row: string[] = [];
        let cell = '';
        let quoted = false;
        let closed = false;
        for (let index = 0; index < text.length; index += 1) {
            const char = text[index];
            if (quoted) {
                if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
                else if (char === '"') { quoted = false; closed = true; }
                else cell += char;
            } else if (char === '"') {
                if (cell.length || closed) throw new BadRequestException('CSV có dấu ngoặc kép sai vị trí');
                quoted = true;
            }
            else if (char === ',') { row.push(cell); cell = ''; closed = false; }
            else if (char === '\n' || char === '\r') {
                if (char === '\r' && text[index + 1] === '\n') index += 1;
                row.push(cell); rows.push(row); row = []; cell = ''; closed = false;
            }
            else {
                if (closed) throw new BadRequestException('CSV có ký tự sau dấu ngoặc kép đóng');
                cell += char;
            }
        }
        if (quoted) throw new BadRequestException('CSV có dấu ngoặc kép chưa đóng');
        if (cell.length || row.length) { row.push(cell); rows.push(row); }
        return rows;
    }

    private required(row: CsvRow, field: string, errors: string[]) {
        const value = row[field]?.trim();
        if (!value) errors.push(`${field} là bắt buộc`);
        return value ?? '';
    }

    private safeCell(value: string, field: string, errors: string[]) {
        const normalized = value.trim();
        if (/^[=+\-@]/.test(normalized)) errors.push(`${field} chứa biểu thức spreadsheet không được phép`);
        return normalized;
    }

    private validDate(value: string, field: string, errors: string[]) {
        if (!value) return;
        try { this.date(value, field, true); } catch (error) { errors.push(error instanceof Error ? error.message : `${field} không hợp lệ`); }
    }

    private async referenceData(client: Prisma.TransactionClient = this.prisma) {
        const [schemes, standards, iaf, classifications, industryMappings, naceIafMappings] = await Promise.all([
            client.certification_schemes.findMany(),
            client.standard_editions.findMany({ select: { standard_code: true, edition: true } }),
            client.iaf_scopes.findMany(),
            client.industry_classifications.findMany(),
            client.industry_code_mappings.findMany(),
            client.nace_iaf_mappings.findMany(),
        ]);
        return { schemes, standards, iaf, classifications, industryMappings, naceIafMappings };
    }

    private async validateRows(entityType: string, rows: string[][], client: Prisma.TransactionClient = this.prisma, ownMappingIds: string[] = []): Promise<ValidatedRow[]> {
        const expected = IMPORT_DEFINITIONS[entityType];
        if (!expected) throw new BadRequestException('Loại import không được hỗ trợ');
        if (rows.length < 2) throw new BadRequestException('CSV phải có header và ít nhất một dòng dữ liệu');
        const headers = rows[0].map((value) => value.trim().toLowerCase());
        if (headers.length !== expected.length || headers.some((value, index) => value !== expected[index])) {
            throw new BadRequestException(`Header CSV phải đúng thứ tự: ${expected.join(',')}`);
        }
        const refs = await this.referenceData(client);
        refs.industryMappings = refs.industryMappings.filter((item) => !ownMappingIds.includes(item.id));
        refs.naceIafMappings = refs.naceIafMappings.filter((item) => !ownMappingIds.includes(item.id));
        const seen = new Set<string>();
        return rows.slice(1).map((values, index) => {
            const raw = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? ''])) as CsvRow;
            const errors: string[] = [];
            if (values.length !== headers.length) errors.push(`Dòng có ${values.length} cột; yêu cầu ${headers.length} cột`);
            const warnings: string[] = [];
            const normalized = Object.fromEntries(headers.map((header) => [header, this.safeCell(raw[header] ?? '', header, errors)])) as CsvRow;
            const limits: Record<string, number> = { code: entityType === 'SCHEME' ? 100 : 30, name: 255, scheme_code: 100, standard_code: 100, standard_name: 255, edition: 50, iaf_code: 20, iaf_name: 500, title_en: 500, title_vi: 500, parent_code: 30, classification_type: 20, revision: 30, isic_revision: 30, nace_revision: 30, isic_code: 30, nace_code: 30, management_system: 30, mapping_type: 30 };
            for (const [field, value] of Object.entries(normalized)) if (limits[field] && value.length > limits[field]) errors.push(`${field} vượt giới hạn ${limits[field]} ký tự`);
            let key = '';
            if (entityType === 'SCHEME') {
                normalized.code = this.code(this.required(normalized, 'code', errors));
                this.required(normalized, 'name', errors); key = normalized.code;
                this.validDate(normalized.effective_from, 'effective_from', errors); this.validDate(normalized.effective_to, 'effective_to', errors);
                if (refs.schemes.some((item) => item.code === normalized.code)) errors.push('scheme code đã tồn tại');
            } else if (entityType === 'STANDARD_EDITION') {
                normalized.scheme_code = this.code(this.required(normalized, 'scheme_code', errors));
                normalized.standard_code = this.code(this.required(normalized, 'standard_code', errors));
                this.required(normalized, 'standard_name', errors); this.required(normalized, 'edition', errors);
                this.validDate(this.required(normalized, 'effective_from', errors), 'effective_from', errors);
                key = `${normalized.standard_code}:${normalized.edition}`;
                if (!refs.schemes.some((item) => item.code === normalized.scheme_code)) errors.push('scheme_code không tồn tại');
                if (refs.standards.some((item) => item.standard_code === normalized.standard_code && item.edition === normalized.edition)) errors.push('standard edition đã tồn tại');
            } else if (entityType === 'IAF_SCOPE') {
                normalized.iaf_code = this.code(this.required(normalized, 'iaf_code', errors), 20);
                this.required(normalized, 'iaf_name', errors); key = normalized.iaf_code;
                if (refs.iaf.some((item) => item.iaf_code === normalized.iaf_code)) errors.push('IAF code đã tồn tại');
            } else if (entityType === 'INDUSTRY_CLASSIFICATION') {
                normalized.classification_type = this.code(this.required(normalized, 'classification_type', errors), 20);
                normalized.revision = this.code(this.required(normalized, 'revision', errors), 30);
                normalized.code = this.required(normalized, 'code', errors); this.required(normalized, 'title_en', errors);
                if (!['ISIC', 'NACE'].includes(normalized.classification_type)) errors.push('classification_type chỉ nhận ISIC hoặc NACE');
                const level = Number(normalized.level); if (!Number.isInteger(level) || level < 1 || level > 4) errors.push('level phải từ 1 đến 4');
                const revision = TAXONOMY_OPERATIONAL_REVISIONS[normalized.classification_type as keyof typeof TAXONOMY_OPERATIONAL_REVISIONS];
                if (normalized.revision !== revision) errors.push('revision không thuộc phiên bản vận hành');
                if (level > 1) {
                    const parent = refs.classifications.find((item) => item.classification_type === normalized.classification_type && item.revision === normalized.revision && item.code === normalized.parent_code);
                    if (!parent || parent.level !== level - 1 || !parent.is_active) errors.push('parent_code phải tồn tại, đang hoạt động và đúng cấp cha; nạp cấp cha trước');
                } else if (normalized.parent_code) errors.push('Mã cấp 1 không được có parent_code');
                this.validDate(normalized.valid_from, 'valid_from', errors); this.validDate(normalized.valid_to, 'valid_to', errors);
                key = `${normalized.classification_type}:${normalized.revision}:${normalized.code}`;
                if (refs.classifications.some((item) => item.classification_type === normalized.classification_type && item.revision === normalized.revision && item.code === normalized.code)) errors.push('mã phân loại đã tồn tại');
            } else if (entityType === 'ISIC_NACE_MAPPING') {
                normalized.isic_revision = this.code(this.required(normalized, 'isic_revision', errors), 30);
                normalized.isic_code = this.required(normalized, 'isic_code', errors);
                normalized.nace_revision = this.code(this.required(normalized, 'nace_revision', errors), 30);
                normalized.nace_code = this.required(normalized, 'nace_code', errors);
                normalized.mapping_type = this.code(this.required(normalized, 'mapping_type', errors), 30);
                if (!(TAXONOMY_MAPPING_TYPES as readonly string[]).includes(normalized.mapping_type)) errors.push('mapping_type chỉ nhận EXACT, PARTIAL hoặc ONE_TO_MANY');
                this.validDate(normalized.valid_from, 'valid_from', errors); this.validDate(normalized.valid_to, 'valid_to', errors);
                const isic = refs.classifications.find((item) => item.classification_type === 'ISIC' && item.revision === normalized.isic_revision && item.code === normalized.isic_code);
                const nace = refs.classifications.find((item) => item.classification_type === 'NACE' && item.revision === normalized.nace_revision && item.code === normalized.nace_code);
                if (!isic) errors.push('ISIC revision/code không tồn tại');
                if (!nace) errors.push('NACE revision/code không tồn tại');
                if (normalized.isic_revision !== TAXONOMY_OPERATIONAL_REVISIONS.ISIC || normalized.nace_revision !== TAXONOMY_OPERATIONAL_REVISIONS.NACE) errors.push('revision không thuộc phiên bản vận hành');
                const today = new Date(); today.setUTCHours(0, 0, 0, 0);
                if (isic && !this.taxonomyPolicy.isOperationalClassification(isic, today)) errors.push('ISIC không đang hiệu lực');
                if (nace && !this.taxonomyPolicy.isOperationalClassification(nace, today)) errors.push('NACE không đang hiệu lực');
                key = `${normalized.isic_revision}:${normalized.isic_code}:${normalized.nace_revision}:${normalized.nace_code}`;
                if (isic && nace && refs.industryMappings.some((item) => item.source_code_id === isic.id && item.target_code_id === nace.id)) errors.push('ISIC–NACE mapping đã tồn tại');
            } else {
                normalized.nace_revision = this.code(this.required(normalized, 'nace_revision', errors), 30);
                normalized.nace_code = this.required(normalized, 'nace_code', errors);
                normalized.iaf_code = this.code(this.required(normalized, 'iaf_code', errors), 20);
                normalized.management_system = this.code(this.required(normalized, 'management_system', errors), 30);
                if (!(TAXONOMY_MANAGEMENT_SYSTEMS as readonly string[]).includes(normalized.management_system)) errors.push('management_system chỉ nhận QMS, EMS hoặc OHSMS');
                if (normalized.nace_revision !== TAXONOMY_OPERATIONAL_REVISIONS.NACE) errors.push('revision không thuộc phiên bản vận hành');
                this.validDate(normalized.valid_from, 'valid_from', errors); this.validDate(normalized.valid_to, 'valid_to', errors);
                const nace = refs.classifications.find((item) => item.classification_type === 'NACE' && item.revision === normalized.nace_revision && item.code === normalized.nace_code);
                const iaf = refs.iaf.find((item) => item.iaf_code === normalized.iaf_code);
                if (!nace) errors.push('NACE revision/code không tồn tại');
                if (!iaf) errors.push('IAF code không tồn tại');
                const today = new Date(); today.setUTCHours(0, 0, 0, 0);
                if (nace && !this.taxonomyPolicy.isOperationalClassification(nace, today)) errors.push('NACE không đang hiệu lực');
                if (iaf && !iaf.is_active) errors.push('IAF không hoạt động');
                key = `${normalized.nace_revision}:${normalized.nace_code}:${normalized.iaf_code}:${normalized.management_system}`;
                if (nace && iaf && refs.naceIafMappings.some((item) => item.nace_code_id === nace.id && item.iaf_scope_id === iaf.id && item.management_system === normalized.management_system)) errors.push('NACE–IAF mapping đã tồn tại');
            }
            for (const [from, to] of [['valid_from', 'valid_to'], ['effective_from', 'effective_to']]) {
                if (normalized[from] && normalized[to] && normalized[from] > normalized[to]) errors.push(`${from} phải trước hoặc bằng ${to}`);
            }
            if (entityType.endsWith('_MAPPING')) warnings.push('Lưu bản nháp; cần xem xét và công bố trước khi runtime sử dụng');
            const references = [
                ...refs.classifications.filter((item) =>
                    (item.classification_type === 'ISIC' && item.revision === normalized.isic_revision && item.code === normalized.isic_code) ||
                    (item.classification_type === 'NACE' && item.revision === normalized.nace_revision && item.code === normalized.nace_code) ||
                    (entityType === 'INDUSTRY_CLASSIFICATION' && item.classification_type === normalized.classification_type && item.revision === normalized.revision && item.code === normalized.parent_code)),
                ...refs.iaf.filter((item) => entityType === 'NACE_IAF_MAPPING' && item.iaf_code === normalized.iaf_code),
                ...refs.schemes.filter((item) => entityType === 'STANDARD_EDITION' && item.code === normalized.scheme_code),
            ];
            normalized.__reference_hash = createHash('sha256').update(JSON.stringify(references.sort((a, b) => a.id.localeCompare(b.id)))).digest('hex');
            let status: ValidatedRow['status'] = errors.some((error) => error.includes('đã tồn tại')) ? 'DUPLICATE' : errors.length ? 'INVALID' : 'VALID';
            if (key && seen.has(key)) { errors.push('Trùng khóa trong cùng file'); status = 'DUPLICATE'; }
            seen.add(key);
            return { rowNumber: index + 2, raw, normalized: errors.length ? normalized : normalized, status, errors, warnings };
        });
    }

    async validateImport(entityTypeInput: string, mode: string | undefined, file: Express.Multer.File, userId: string) {
        const entityType = this.code(entityTypeInput, 50);
        if (mode && mode !== 'CREATE_ONLY') throw new BadRequestException('Chỉ hỗ trợ CREATE_ONLY');
        if (!file || !file.originalname.toLowerCase().endsWith('.csv')) throw new BadRequestException('Chỉ chấp nhận file CSV UTF-8');
        if (file.size > 2 * 1024 * 1024 || file.buffer.length > 2 * 1024 * 1024) throw new BadRequestException('File CSV vượt quá giới hạn 2 MB');
        const rows = this.parseCsv(file.buffer);
        if (rows.length > 5001) throw new BadRequestException('File CSV vượt quá 5.000 dòng dữ liệu');
        const validated = await this.validateRows(entityType, rows);
        const counts = {
            total_rows: validated.length,
            valid_rows: validated.filter((row) => row.status === 'VALID').length,
            invalid_rows: validated.filter((row) => row.status === 'INVALID').length,
            duplicate_rows: validated.filter((row) => row.status === 'DUPLICATE').length,
            warning_rows: validated.filter((row) => row.warnings.length).length,
        };
        const job = await this.prisma.import_jobs.create({
            data: {
                entity_type: entityType, import_mode: 'CREATE_ONLY', source_file_name: file.originalname,
                source_sha256: createHash('sha256').update(file.buffer).digest('hex'), imported_by: userId, ...counts,
                rows: { create: validated.map((row) => ({
                    row_number: row.rowNumber, raw_data: JSON.stringify(row.raw), normalized_data: JSON.stringify(row.normalized),
                    validation_status: row.status, errors: row.errors.length ? JSON.stringify(row.errors) : null,
                    warnings: row.warnings.length ? JSON.stringify(row.warnings) : null,
                })) },
            },
            include: { rows: { orderBy: { row_number: 'asc' } } },
        });
        await this.writeAudit(userId, 'IMPORT_VALIDATED', 'import_job', job.id, 201);
        return job;
    }

    async getImportJob(id: string) {
        const job = await this.prisma.import_jobs.findUnique({ where: { id }, include: { rows: { orderBy: { row_number: 'asc' } } } });
        if (!job) throw new NotFoundException('Không tìm thấy import job');
        let publication_state = job.status === 'COMMITTED' ? 'STORED' : job.status;
        let can_publish = false;
        const mapping = ['ISIC_NACE_MAPPING', 'NACE_IAF_MAPPING'].includes(job.entity_type);
        if (mapping && job.status === 'COMMITTED') {
            const ids = job.rows.map((row) => row.committed_entity_id).filter((value): value is string => Boolean(value));
            const targets = await this.importMappingTargets(this.prisma, job.entity_type, ids);
            const complete = targets.length === job.total_rows && ids.length === job.total_rows && targets.length > 0;
            let current = complete;
            for (const target of targets) {
                try { this.taxonomyPolicy.assertPublishableMapping(target); } catch { current = false; }
            }
            can_publish = complete && current && targets.every((target) => {
                const row = job.rows.find((item) => item.committed_entity_id === target.id);
                return target.mapping_status === 'DRAFT' && Boolean(row?.normalized_data) && this.importMappingUnchanged(target, JSON.parse(row!.normalized_data!) as CsvRow);
            });
            publication_state = complete && targets.every((target) => target.mapping_status === 'APPROVED')
                ? current ? 'OPERATIONAL' : 'PUBLISHED_NOT_CURRENT'
                : can_publish ? 'READY_FOR_PUBLICATION' : 'DRAFTS_NEED_REVIEW';
        }
        return { ...job, publication_state, can_publish, can_commit: job.status === 'VALIDATED' && job.total_rows > 0 && !job.invalid_rows && !job.duplicate_rows };
    }

    async listImportJobs() {
        return this.prisma.import_jobs.findMany({ orderBy: { created_at: 'desc' }, take: 100 });
    }

    async commitImport(id: string, userId: string) {
        const result = await this.prisma.$transaction(async (tx) => {
        const job = await this.lockImportJob(tx, id);
        if (job.status === 'COMMITTED') throw new ConflictException('Import job đã commit; không thể chạy lại');
        if (job.status !== 'VALIDATED') throw new ConflictException('Import job không ở trạng thái VALIDATED');
        if (job.invalid_rows || job.duplicate_rows) throw new ConflictException('Phải sửa toàn bộ dòng invalid/duplicate trước khi commit');
            if (!job.rows.length || job.rows.length !== job.total_rows || job.rows.some((row) => row.validation_status !== 'VALID' || !row.normalized_data)) throw new ConflictException('Import job không đủ dòng hợp lệ');
            const columns = IMPORT_DEFINITIONS[job.entity_type];
            if (!columns) throw new ConflictException('Loại import không hợp lệ');
            const checked = await this.validateRows(job.entity_type, [columns, ...job.rows.map((row) => {
                const data = JSON.parse(row.normalized_data!) as CsvRow;
                return columns.map((column) => data[column] ?? '');
            })], tx);
            if (checked.some((row) => row.status !== 'VALID')) throw new ConflictException({ message: 'Dữ liệu thay đổi sau kiểm tra; cần tải lại CSV', rows: checked });
            if (checked.some((row, index) => {
                const previous = JSON.parse(job.rows[index].normalized_data!) as CsvRow;
                return previous.__reference_hash && previous.__reference_hash !== row.normalized?.__reference_hash;
            })) throw new ConflictException('Tham chiếu đã thay đổi sau preview; cần kiểm tra lại CSV');
            let committed = 0;
            for (const row of job.rows) {
                if (row.validation_status !== 'VALID' || !row.normalized_data) continue;
                const data = JSON.parse(row.normalized_data) as CsvRow;
                let entityId: string;
                if (job.entity_type === 'SCHEME') {
                    const created = await tx.certification_schemes.create({ data: {
                        code: data.code, name: data.name, description: this.text(data.description),
                        effective_from: this.date(data.effective_from, 'effective_from'), effective_to: this.date(data.effective_to, 'effective_to'),
                        created_by: userId, updated_by: userId,
                    } }); entityId = created.id;
                } else if (job.entity_type === 'STANDARD_EDITION') {
                    const scheme = await tx.certification_schemes.findUnique({ where: { code: data.scheme_code } });
                    if (!scheme) throw new BadRequestException(`scheme_code không tồn tại tại dòng ${row.row_number}`);
                    const created = await tx.standard_editions.create({ data: {
                        scheme_id: scheme.id, standard_code: data.standard_code, standard_name: data.standard_name,
                        edition: data.edition, effective_from: this.date(data.effective_from, 'effective_from', true)!,
                        created_by: userId, updated_by: userId,
                    } }); entityId = created.id;
                } else if (job.entity_type === 'IAF_SCOPE') {
                    const created = await tx.iaf_scopes.create({ data: { iaf_code: data.iaf_code, iaf_name: data.iaf_name, description: this.text(data.description) } });
                    entityId = created.id;
                } else if (job.entity_type === 'INDUSTRY_CLASSIFICATION') {
                    const created = await tx.industry_classifications.create({ data: {
                        classification_type: data.classification_type, revision: data.revision, code: data.code,
                        title_en: data.title_en, title_vi: this.text(data.title_vi), parent_code: this.text(data.parent_code),
                        level: Number(data.level), valid_from: this.date(data.valid_from, 'valid_from'), valid_to: this.date(data.valid_to, 'valid_to'),
                    } }); entityId = created.id;
                } else if (job.entity_type === 'ISIC_NACE_MAPPING') {
                    const [isic, nace] = await Promise.all([
                        tx.industry_classifications.findFirst({ where: { classification_type: 'ISIC', revision: data.isic_revision, code: data.isic_code } }),
                        tx.industry_classifications.findFirst({ where: { classification_type: 'NACE', revision: data.nace_revision, code: data.nace_code } }),
                    ]);
                    if (!isic || !nace) throw new BadRequestException(`Tham chiếu ISIC/NACE thay đổi sau preview tại dòng ${row.row_number}`);
                    const created = await tx.industry_code_mappings.create({ data: {
                        source_code_id: isic.id, target_code_id: nace.id, mapping_type: data.mapping_type,
                        mapping_status: 'DRAFT', note: this.text(data.note), valid_from: this.date(data.valid_from, 'valid_from'),
                        valid_to: this.date(data.valid_to, 'valid_to'),
                    } }); entityId = created.id;
                } else {
                    const [nace, iaf] = await Promise.all([
                        tx.industry_classifications.findFirst({ where: { classification_type: 'NACE', revision: data.nace_revision, code: data.nace_code } }),
                        tx.iaf_scopes.findUnique({ where: { iaf_code: data.iaf_code } }),
                    ]);
                    if (!nace || !iaf) throw new BadRequestException(`Tham chiếu NACE/IAF thay đổi sau preview tại dòng ${row.row_number}`);
                    const created = await tx.nace_iaf_mappings.create({ data: {
                        nace_code_id: nace.id, iaf_scope_id: iaf.id, management_system: data.management_system,
                        source_document: this.text(data.source_document), valid_from: this.date(data.valid_from, 'valid_from'),
                        valid_to: this.date(data.valid_to, 'valid_to'), mapping_status: 'DRAFT',
                    } }); entityId = created.id;
                }
                await tx.import_job_rows.update({ where: { id: row.id }, data: { committed_entity_id: entityId } });
                committed += 1;
            }
            const result = await tx.import_jobs.update({ where: { id }, data: { status: 'COMMITTED', committed_rows: committed, committed_at: new Date() } });
            await tx.audit_logs.create({ data: { user_id: userId, action: 'IMPORT_COMMITTED', entity_type: 'import_job', entity_id: id, outcome: 'success', details_json: JSON.stringify({ committed_rows: committed }) } });
            return result;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return result;
    }

    private async lockImportJob(tx: Prisma.TransactionClient, id: string) {
        await tx.$queryRaw`SELECT id FROM dbo.import_jobs WITH (UPDLOCK, HOLDLOCK) WHERE id = CONVERT(uniqueidentifier, ${id})`;
        const job = await tx.import_jobs.findUnique({ where: { id }, include: { rows: { orderBy: { row_number: 'asc' } } } });
        if (!job) throw new NotFoundException('Không tìm thấy import job');
        return job;
    }

    private async importMappingTargets(tx: Prisma.TransactionClient, entityType: string, ids: string[]) {
        // Stay below SQL Server's parameter ceiling for 5,000-row jobs.
        const batches: Array<Array<Parameters<TaxonomyRuntimePolicyService['assertPublishableMapping']>[0] & { mapping_status: string }>> = [];
        for (let start = 0; start < ids.length; start += 500) {
            const chunk = ids.slice(start, start + 500);
            batches.push(entityType === 'ISIC_NACE_MAPPING'
                ? await tx.industry_code_mappings.findMany({ where: { id: { in: chunk } }, include: { source_code: true, target_code: true } })
                : await tx.nace_iaf_mappings.findMany({ where: { id: { in: chunk } }, include: { nace_code: true, iaf_scope: true } }));
        }
        return batches.flat();
    }

    private importMappingUnchanged(mapping: Parameters<TaxonomyRuntimePolicyService['assertPublishableMapping']>[0], original: CsvRow) {
        const refs = 'source_code' in mapping ? [mapping.source_code, mapping.target_code] : [mapping.nace_code, mapping.iaf_scope];
        const hash = createHash('sha256').update(JSON.stringify(refs.sort((a, b) => a.id.localeCompare(b.id)))).digest('hex');
        if (original.__reference_hash && original.__reference_hash !== hash) return false;
        const dateMatches = (value: Date | null, field: string) => (value?.toISOString().slice(0, 10) ?? '') === (original[field] ?? '');
        const unchanged = 'source_code' in mapping
            ? mapping.source_code.code === original.isic_code && mapping.source_code.revision === original.isic_revision && mapping.target_code.code === original.nace_code && mapping.target_code.revision === original.nace_revision && mapping.mapping_type === original.mapping_type
            : mapping.nace_code.code === original.nace_code && mapping.nace_code.revision === original.nace_revision && mapping.iaf_scope.iaf_code === original.iaf_code && mapping.management_system === original.management_system;
        return unchanged && dateMatches(mapping.valid_from, 'valid_from') && dateMatches(mapping.valid_to, 'valid_to');
    }

    async publishImport(id: string, userId: string) {
        await this.prisma.$transaction(async (tx) => {
            const job = await this.lockImportJob(tx, id);
            if (job.status !== 'COMMITTED' || !['ISIC_NACE_MAPPING', 'NACE_IAF_MAPPING'].includes(job.entity_type) || !job.rows.length || job.committed_rows !== job.rows.length) throw new ConflictException('Chỉ lô mapping đã lưu đầy đủ mới được công bố');
            const ids = job.rows.map((row) => row.committed_entity_id!);
            if (ids.some((value) => !value) || new Set(ids).size !== ids.length) throw new ConflictException('Liên kết mapping của lô không hợp lệ');
            const columns = IMPORT_DEFINITIONS[job.entity_type];
            const originals = job.rows.map((row) => JSON.parse(row.normalized_data!) as CsvRow);
            const checked = await this.validateRows(job.entity_type, [columns, ...originals.map((row) => columns.map((column) => row[column] ?? ''))], tx, ids);
            if (checked.some((row, index) => row.status !== 'VALID' || (originals[index].__reference_hash && originals[index].__reference_hash !== row.normalized?.__reference_hash))) throw new ConflictException('Dữ liệu hoặc tham chiếu đã thay đổi; cần kiểm tra lại lô trước công bố');
            const mappings = await this.importMappingTargets(tx, job.entity_type, ids);
            if (mappings.length !== ids.length || mappings.some((mapping) => mapping.mapping_status !== 'DRAFT')) throw new ConflictException('Mapping đã thay đổi, đã công bố hoặc không còn tồn tại');
            for (const mapping of mappings) {
                this.taxonomyPolicy.assertPublishableMapping(mapping);
                const row = job.rows.find((item) => item.committed_entity_id === mapping.id)!;
                const original = JSON.parse(row.normalized_data!) as CsvRow;
                if (!this.importMappingUnchanged(mapping, original)) throw new ConflictException(`Mapping dòng ${row.row_number} đã thay đổi sau lưu`);
            }
            const data = { mapping_status: 'APPROVED', approved_by: userId, approved_at: new Date() };
            for (let start = 0; start < ids.length; start += 500) {
                const chunk = ids.slice(start, start + 500);
                const result = job.entity_type === 'ISIC_NACE_MAPPING'
                    ? await tx.industry_code_mappings.updateMany({ where: { id: { in: chunk }, mapping_status: 'DRAFT' }, data })
                    : await tx.nace_iaf_mappings.updateMany({ where: { id: { in: chunk }, mapping_status: 'DRAFT' }, data });
                if (result.count !== chunk.length) throw new ConflictException('Mapping thay đổi trong khi công bố');
            }
            await tx.audit_logs.create({ data: { user_id: userId, action: 'IMPORT_PUBLISHED', entity_type: 'import_job', entity_id: id, outcome: 'success', details_json: JSON.stringify({ mapping_ids: ids, published_at: data.approved_at }) } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        return this.getImportJob(id);
    }
}

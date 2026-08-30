import {
    BadRequestException,
    Injectable,
    NotFoundException,
    Optional,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { MandayRulesService } from '../manday-calculations/manday-rules.service';
import { ReviewSurveillanceChangeDto } from './dto/review-surveillance-change.dto';
import { SaveSurveillanceInformationDto } from './dto/save-surveillance-information.dto';
import {
    calculateSurveillanceChanges,
    summarizeSurveillanceChanges,
} from './surveillance-information.utils';
import {
    hasSignificantSurveillanceChange,
    surveillanceNextAction,
} from './surveillance-workflow';
import { WORK_ITEM_ACTIONS } from '../work-items/work-item.constants';
import { WorkItemsService } from '../work-items/work-items.service';

type SnapshotData = Record<string, unknown>;

@Injectable()
export class SurveillanceInformationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mandayRules: MandayRulesService,
        @Optional()
        private readonly workItems?: WorkItemsService,
    ) { }

    private normalize(value?: string | null) {
        return (value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    private isSurveillanceEvent(value?: string | null) {
        const normalized = this.normalize(value);
        return normalized.startsWith('surveillance');
    }

    private surveillanceRank(value?: string | null) {
        const normalized = this.normalize(value);
        if (normalized.includes('2')) return 2;
        if (normalized.includes('1')) return 1;
        return 0;
    }

    private parseJson<T>(value?: string | null, fallback?: T): T {
        if (!value) return fallback as T;
        try {
            return JSON.parse(value) as T;
        } catch {
            return fallback as T;
        }
    }

    private numberOrNull(value: unknown): number | null {
        if (value === null || value === undefined) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private cleanData(data: SnapshotData): SnapshotData {
        const cleaned: SnapshotData = {};
        for (const [key, value] of Object.entries(data)) {
            if (value === undefined) continue;
            cleaned[key] = typeof value === 'string' ? value.trim() : value;
        }

        if (Array.isArray(cleaned.sites)) {
            const sites = [...cleaned.sites]
                .map((site) => ({ ...(site as Record<string, unknown>) }))
                .sort((left, right) => Number(left.site_no ?? 0) - Number(right.site_no ?? 0));
            cleaned.sites = sites;
            cleaned.site_count = sites.length;
        }
        return cleaned;
    }

    private async getEvent(projectId: string, eventId: string) {
        const event = await this.prisma.audit_program_events.findUnique({
            where: { id: eventId },
            include: {
                audit_programs: {
                    select: {
                        id: true,
                        project_id: true,
                        program_code: true,
                    },
                },
            },
        });

        if (!event || event.audit_programs.project_id !== projectId) {
            throw new NotFoundException('Không tìm thấy kỳ giám sát thuộc hồ sơ chứng nhận này.');
        }
        if (!this.isSurveillanceEvent(event.event_type)) {
            throw new BadRequestException('Phiếu cập nhật thông tin chỉ áp dụng cho kỳ đánh giá giám sát.');
        }
        return event;
    }

    private async getInitialBaseline(projectId: string): Promise<{
        data: SnapshotData;
        surveillanceMandays: number | null;
    }> {
        const project = await this.prisma.certification_projects.findUnique({
            where: { id: projectId },
            include: {
                certification_applications: {
                    include: {
                        customers: true,
                        sites: { orderBy: { site_no: 'asc' } },
                        application_reviews: {
                            orderBy: [
                                { approved_at: 'desc' },
                                { created_at: 'desc' },
                            ],
                        },
                    },
                },
                audit_programs: {
                    orderBy: [
                        { program_year: 'asc' },
                        { version_no: 'asc' },
                    ],
                    take: 1,
                },
            },
        });

        if (!project) {
            throw new NotFoundException('Không tìm thấy hồ sơ chứng nhận.');
        }

        const application = project.certification_applications;
        const customer = application.customers;
        const baselineProgram = project.audit_programs[0] ?? null;
        const approvedReview = application.application_reviews.find(
            (review) => this.normalize(review.workflow_status) === 'approved',
        ) ?? application.application_reviews[0] ?? null;

        return {
            data: this.cleanData({
                company_name: baselineProgram?.organization_name ?? customer.company_name,
                company_name_en: application.company_name_en,
                country_code: customer.country_code,
                country_name: customer.country_name,
                tax_code: customer.tax_code,
                registered_address: baselineProgram?.address ?? customer.address,
                headquarters_address: baselineProgram?.address ?? application.headquarters_address ?? customer.address,
                representative_name: application.representative_name,
                representative_position: application.representative_position,
                representative_phone: application.representative_phone,
                representative_email: application.representative_email,
                contact_name: application.contact_name,
                contact_position: application.contact_position,
                contact_phone: application.contact_phone,
                contact_email: application.contact_email,
                standard_name: baselineProgram?.standard_name ?? application.standard_name,
                certification_scope: baselineProgram?.certification_scope ?? application.certification_scope,
                excluded_clauses: application.excluded_clauses,
                site_count: application.site_count,
                total_employee_count: application.total_employee_count,
                employee_count: approvedReview?.effective_personnel ?? baselineProgram?.effective_personnel ?? application.employee_count,
                shift_count: application.shift_count,
                external_provider_used: application.external_provider_used,
                outsourced_processes: application.outsourced_processes,
                management_system_details: application.management_system_details,
                certificate_languages: application.certificate_languages,
                other_requests: application.other_requests,
                sites: application.sites.map((site) => ({
                    site_no: site.site_no,
                    site_name: site.site_name,
                    address: site.address,
                    activities: site.activities,
                    employee_count: site.employee_count,
                    is_headquarters: site.is_headquarters,
                })),
            }),
            surveillanceMandays: this.numberOrNull(approvedReview?.surveillance_mandays),
        };
    }

    private async resolveBaseline(projectId: string, event: {
        id: string;
        event_type: string;
        sequence_no: number;
        program_id: string;
        planned_mandays: unknown;
    }) {
        const initial = await this.getInitialBaseline(projectId);
        const confirmedSnapshots = await this.prisma.surveillance_information_snapshots.findMany({
            where: {
                project_id: projectId,
                status: { in: ['CONFIRMED', 'REVIEWED'] },
                audit_event_id: { not: event.id },
            },
            include: {
                audit_event: {
                    select: {
                        id: true,
                        event_type: true,
                        sequence_no: true,
                        program_id: true,
                    },
                },
            },
            orderBy: [
                { confirmed_at: 'desc' },
                { version_no: 'desc' },
                { created_at: 'desc' },
            ],
        });

        const currentRank = this.surveillanceRank(event.event_type);
        const previous = confirmedSnapshots.find((snapshot) => {
            if (snapshot.audit_event.program_id === event.program_id) {
                return snapshot.audit_event.sequence_no < event.sequence_no;
            }
            const previousRank = this.surveillanceRank(snapshot.audit_event.event_type);
            return currentRank > 0 && previousRank > 0 && previousRank < currentRank;
        }) ?? null;

        const eventMandays = this.numberOrNull(event.planned_mandays);
        if (!previous) {
            return {
                sourceType: 'INITIAL_APPLICATION' as const,
                sourceSnapshotId: null,
                sourceLabel: 'Hồ sơ lần đầu đã được phê duyệt',
                data: initial.data,
                mandays: eventMandays ?? initial.surveillanceMandays,
            };
        }

        return {
            sourceType: 'PREVIOUS_SURVEILLANCE' as const,
            sourceSnapshotId: previous.id,
            sourceLabel: `Thông tin đã xác nhận tại ${this.surveillanceRank(previous.audit_event.event_type) === 2 ? 'GS2' : 'GS1'}`,
            data: this.cleanData(this.parseJson<SnapshotData>(previous.data_json, {})),
            mandays: this.numberOrNull(previous.effective_mandays)
                ?? eventMandays
                ?? initial.surveillanceMandays,
        };
    }

    private serializeSnapshot(snapshot: any) {
        if (!snapshot) return null;
        return {
            id: snapshot.id,
            version_no: snapshot.version_no,
            status: snapshot.status,
            source_snapshot_id: snapshot.source_snapshot_id,
            source_type: snapshot.source_type,
            baseline: this.parseJson<SnapshotData>(snapshot.baseline_json, {}),
            data: this.parseJson<SnapshotData>(snapshot.data_json, {}),
            changes: this.parseJson(snapshot.changes_json, []),
            change_impact: snapshot.change_impact,
            manday_decision: snapshot.manday_decision,
            baseline_mandays: this.numberOrNull(snapshot.baseline_mandays),
            effective_mandays: this.numberOrNull(snapshot.effective_mandays),
            note: snapshot.note,
            prepared_by: snapshot.prepared_by,
            confirmed_by: snapshot.confirmed_by,
            confirmed_at: snapshot.confirmed_at,
            effective_from: snapshot.effective_from,
            created_at: snapshot.created_at,
            updated_at: snapshot.updated_at,
        };
    }

    private snapshotChanges(snapshot: any) {
        return this.parseJson<Array<{
            category?: string | null;
            affects_manday?: boolean | null;
        }>>(snapshot?.changes_json, []);
    }

    private standards(value: unknown) {
        const source = String(value ?? '');
        const matched = source.match(/ISO\s*(?:9001|14001|45001)(?::\d{4})?/gi) ?? [];
        if (matched.length) return Array.from(new Set(matched.map((item) => item.replace(/ISO\s*/i, 'ISO '))));
        return source.split(/[;,|+]/).map((item) => item.trim()).filter(Boolean);
    }

    private async recalculateMandays(projectId: string, data: SnapshotData) {
        const approved = await this.prisma.manday_calculations.findFirst({
            where: {
                project_id: projectId,
                status: { in: ['approved', 'APPROVED'] },
            },
            orderBy: [
                { approved_at: 'desc' },
                { version_no: 'desc' },
            ],
        });
        if (!approved) {
            throw new BadRequestException(
                'Chưa có phép tính ngày công được phê duyệt để áp dụng cơ chế tính lại hiện hành.',
            );
        }

        const effectivePersonnel = Number(data.employee_count ?? data.total_employee_count ?? 0);
        const standards = this.standards(data.standard_name);
        if (!Number.isFinite(effectivePersonnel) || effectivePersonnel < 1 || !standards.length) {
            throw new BadRequestException(
                'Thông tin tiêu chuẩn và nhân sự hiệu dụng chưa đủ để tính lại ngày công.',
            );
        }

        const sites = Array.isArray(data.sites)
            ? data.sites.map((site) => {
                const item = site as Record<string, unknown>;
                return {
                    site_name: String(item.site_name ?? item.address ?? 'Địa điểm'),
                    employee_count: this.numberOrNull(item.employee_count) ?? undefined,
                    is_headquarters: item.is_headquarters === true,
                };
            })
            : [];
        const totalSites = Math.max(1, sites.length || Number(data.site_count ?? approved.total_sites ?? 1));
        const sampledSites = Number(approved.sampled_sites ?? totalSites);
        const complexity = this.normalize(approved.complexity_level);
        const result = this.mandayRules.suggest({
            standards,
            effective_personnel: effectivePersonnel,
            audit_type: 'surveillance',
            ems_complexity: ['high', 'medium', 'low', 'limited', 'special'].includes(complexity)
                ? complexity
                : 'medium',
            ohsms_complexity: ['high', 'medium', 'low'].includes(complexity)
                ? complexity
                : 'medium',
            site_sampling_mode: totalSites <= 1
                ? 'single'
                : sampledSites < totalSites ? 'sampling' : 'non_sampling',
            sites,
            increase_percent: Number(approved.increase_percent ?? 0),
            reduction_percent: Number(approved.reduction_percent ?? 0),
            ims_integration_percent: Number(approved.ims_integration_percent ?? 0),
            combined_audit_capability_percent: Number(approved.combined_audit_capability_percent ?? 0),
            ims_reduction_percent: Number(approved.ims_reduction_percent ?? 0),
        });

        return result.surveillance_mandays;
    }


    private async getClassificationContext(projectId: string) {
        const scopes = await this.prisma.certification_project_scopes.findMany({
            where: {
                project_id: projectId,
                status: 'APPROVED',
            },
            include: {
                isic_nace_mapping: {
                    include: {
                        source_code: true,
                        target_code: true,
                    },
                },
                nace_iaf_mapping: {
                    include: {
                        nace_code: true,
                        iaf_scope: true,
                    },
                },
            },
            orderBy: { selected_at: 'asc' },
        });

        return scopes.map((scope) => ({
            id: scope.id,
            management_system: scope.management_system,
            standard_code: scope.standard_code,
            scope_description: scope.scope_description,
            isic_code: scope.isic_nace_mapping.source_code.code,
            nace_code: scope.isic_nace_mapping.target_code.code,
            iaf_code: scope.nace_iaf_mapping.iaf_scope.iaf_code,
            iaf_name: scope.nace_iaf_mapping.iaf_scope.iaf_name,
        }));
    }

    private async response(projectId: string, eventId: string) {
        const event = await this.getEvent(projectId, eventId);
        const [baseline, classificationContext, snapshots, plan] = await Promise.all([
            this.resolveBaseline(projectId, event),
            this.getClassificationContext(projectId),
            this.prisma.surveillance_information_snapshots.findMany({
                where: { audit_event_id: eventId },
                orderBy: { version_no: 'desc' },
            }),
            this.prisma.audit_plans.findFirst({
                where: { project_id: projectId, audit_event_id: eventId },
                orderBy: [
                    { version_no: 'desc' },
                    { created_at: 'desc' },
                ],
                select: {
                    id: true,
                    audit_team_appointment: { select: { id: true, status: true } },
                },
            }),
        ]);
        const snapshot = snapshots[0] ?? null;

        const serialized = this.serializeSnapshot(snapshot);
        const currentData = serialized?.data ?? baseline.data;
        const changes = serialized?.changes
            ?? calculateSurveillanceChanges(baseline.data, currentData);
        const summary = summarizeSurveillanceChanges(changes);
        const baselineMandays = serialized?.baseline_mandays ?? baseline.mandays;
        const effectiveMandays = serialized?.effective_mandays ?? baselineMandays;
        const nextAction = surveillanceNextAction({
            snapshot: snapshot
                ? {
                    status: snapshot.status,
                    change_impact: snapshot.change_impact,
                    changes: this.snapshotChanges(snapshot),
                }
                : null,
            eventId,
            planId: plan?.id ?? null,
            appointmentExists: this.normalize(plan?.audit_team_appointment?.status) === 'issued',
        });

        return {
            project_id: projectId,
            event: {
                id: event.id,
                event_type: event.event_type,
                sequence_no: event.sequence_no,
                planned_start_date: event.planned_start_date,
                planned_end_date: event.planned_end_date,
                planned_mandays: this.numberOrNull(event.planned_mandays),
                status: event.status,
                program_id: event.program_id,
                program_code: event.audit_programs.program_code,
            },
            source: {
                type: serialized?.source_type ?? baseline.sourceType,
                snapshot_id: serialized?.source_snapshot_id ?? baseline.sourceSnapshotId,
                label: serialized?.source_type === 'PREVIOUS_REVISION'
                    ? `Phiên bản ${Math.max(1, Number(serialized.version_no) - 1)} đã xác nhận`
                    : baseline.sourceLabel,
            },
            classification_context: classificationContext,
            baseline: serialized?.baseline ?? baseline.data,
            current_data: currentData,
            snapshot: serialized,
            history: snapshots.map((item) => this.serializeSnapshot(item)),
            changes,
            summary,
            next_action: nextAction,
            manday: {
                baseline_mandays: baselineMandays,
                current_mandays: this.numberOrNull(event.planned_mandays) ?? effectiveMandays,
                effective_mandays: effectiveMandays,
                decision: serialized?.manday_decision ?? 'KEEP_CURRENT',
                review_recommended: summary.manday_review_recommended,
            },
        };
    }

    async get(projectId: string, eventId: string) {
        return this.response(projectId, eventId);
    }

    async saveDraft(
        projectId: string,
        eventId: string,
        dto: SaveSurveillanceInformationDto,
        actorId: string,
    ) {
        const event = await this.getEvent(projectId, eventId);
        const existing = await this.prisma.surveillance_information_snapshots.findFirst({
            where: { audit_event_id: eventId },
            orderBy: { version_no: 'desc' },
        });

        if (existing && ['confirmed', 'reviewed'].includes(this.normalize(existing.status))) {
            throw new BadRequestException(
                'Thông tin kỳ giám sát đã được xác nhận và được khóa để bảo toàn lịch sử. Hãy tạo bản cập nhật mới.',
            );
        }

        const resolvedBaseline = await this.resolveBaseline(projectId, event);
        const baseline = existing
            ? {
                sourceType: existing.source_type,
                sourceSnapshotId: existing.source_snapshot_id,
                data: this.cleanData(this.parseJson<SnapshotData>(existing.baseline_json, {})),
                mandays: this.numberOrNull(existing.baseline_mandays),
            }
            : resolvedBaseline;
        const data = this.cleanData({
            ...baseline.data,
            ...(dto.data as SnapshotData),
        });
        const changes = calculateSurveillanceChanges(baseline.data, data);
        const summary = summarizeSurveillanceChanges(changes);
        const payload = {
            project_id: projectId,
            audit_event_id: eventId,
            version_no: existing?.version_no ?? 1,
            status: 'DRAFT',
            source_snapshot_id: baseline.sourceSnapshotId,
            source_type: baseline.sourceType,
            baseline_json: JSON.stringify(baseline.data),
            data_json: JSON.stringify(data),
            changes_json: JSON.stringify(changes),
            change_impact: summary.change_impact,
            manday_decision: 'KEEP_CURRENT',
            baseline_mandays: baseline.mandays,
            effective_mandays: baseline.mandays,
            note: dto.note?.trim() || null,
            prepared_by: actorId,
        };

        if (existing) {
            await this.prisma.surveillance_information_snapshots.update({
                where: { id: existing.id },
                data: payload,
            });
        } else {
            await this.prisma.surveillance_information_snapshots.create({ data: payload });
        }

        return this.response(projectId, eventId);
    }

    async confirm(
        projectId: string,
        eventId: string,
        dto: SaveSurveillanceInformationDto,
        actorId: string,
    ) {
        await this.saveDraft(projectId, eventId, dto, actorId);
        const draft = await this.prisma.surveillance_information_snapshots.findFirst({
            where: { audit_event_id: eventId, status: 'DRAFT' },
            orderBy: { version_no: 'desc' },
        });
        if (!draft) {
            throw new BadRequestException('Không tìm thấy bản cập nhật đang lập để xác nhận.');
        }

        const event = await this.getEvent(projectId, eventId);
        await this.prisma.surveillance_information_snapshots.update({
            where: { id: draft.id },
            data: {
                status: 'CONFIRMED',
                manday_decision: 'KEEP_CURRENT',
                effective_mandays: draft.baseline_mandays,
                confirmed_by: actorId,
                confirmed_at: new Date(),
                effective_from: event.planned_start_date ?? new Date(),
            },
        });

        if (
            hasSignificantSurveillanceChange({
                status:
                    'CONFIRMED',
                change_impact:
                    draft.change_impact,
                changes:
                    this.snapshotChanges(
                        draft,
                    ),
            })
        ) {
            await this.workItems?.openWorkItem({
                sourceKey:
                    `surveillance-change-review:${draft.id}`,
                workType:
                    'SURVEILLANCE_CHANGE_REVIEW',
                actionCode:
                    WORK_ITEM_ACTIONS.SURVEILLANCE_CHANGE_REVIEW,
                title:
                    'Rà soát thay đổi trước đánh giá giám sát',
                entityType:
                    'surveillance_information_snapshot',
                entityId:
                    draft.id,
                projectId,
                auditEventId:
                    eventId,
                cycleKey:
                    event.event_type,
                assignedRole:
                    'COORDINATOR',
                priority:
                    'HIGH',
                dueAt:
                    event.planned_start_date,
                destinationPath:
                    `/projects/${projectId}?workspace=surveillance-change&audit_event_id=${eventId}`,
                context: {
                    snapshot_id:
                        draft.id,
                    change_impact:
                        draft.change_impact,
                },
            });
        }

        return this.response(projectId, eventId);
    }

    async createRevision(projectId: string, eventId: string, actorId: string) {
        await this.getEvent(projectId, eventId);
        const latest = await this.prisma.surveillance_information_snapshots.findFirst({
            where: { audit_event_id: eventId },
            orderBy: { version_no: 'desc' },
        });
        if (!latest || !['confirmed', 'reviewed'].includes(this.normalize(latest.status))) {
            throw new BadRequestException('Chỉ có thể tạo bản cập nhật mới từ snapshot đã xác nhận.');
        }

        const inheritedData = this.cleanData(this.parseJson<SnapshotData>(latest.data_json, {}));
        await this.prisma.surveillance_information_snapshots.create({
            data: {
                project_id: projectId,
                audit_event_id: eventId,
                version_no: latest.version_no + 1,
                status: 'DRAFT',
                source_snapshot_id: latest.id,
                source_type: 'PREVIOUS_REVISION',
                baseline_json: JSON.stringify(inheritedData),
                data_json: JSON.stringify(inheritedData),
                changes_json: '[]',
                change_impact: 'NONE',
                manday_decision: 'KEEP_CURRENT',
                baseline_mandays: latest.effective_mandays ?? latest.baseline_mandays,
                effective_mandays: latest.effective_mandays ?? latest.baseline_mandays,
                note: null,
                prepared_by: actorId,
            },
        });

        return this.response(projectId, eventId);
    }

    async reviewChange(
        projectId: string,
        eventId: string,
        dto: ReviewSurveillanceChangeDto,
        _actorId: string,
    ) {
        const event = await this.getEvent(projectId, eventId);
        const snapshot = await this.prisma.surveillance_information_snapshots.findFirst({
            where: { audit_event_id: eventId },
            orderBy: { version_no: 'desc' },
        });
        if (!snapshot || this.normalize(snapshot.status) !== 'confirmed') {
            throw new BadRequestException('Chỉ snapshot đã xác nhận mới được xem xét thay đổi.');
        }
        const reviewNote = dto.review_note.trim();
        if (!reviewNote) {
            throw new BadRequestException('Ghi chú xem xét thay đổi không được để trống.');
        }
        const changes = this.snapshotChanges(snapshot);
        if (!hasSignificantSurveillanceChange({
            status: snapshot.status,
            change_impact: snapshot.change_impact,
            changes,
        })) {
            throw new BadRequestException('Snapshot không có thay đổi cần quy trình xem xét riêng.');
        }

        const currentMandays = this.numberOrNull(event.planned_mandays)
            ?? this.numberOrNull(snapshot.baseline_mandays)
            ?? this.numberOrNull(snapshot.effective_mandays);
        const effectiveMandays = dto.decision === 'RECALCULATED'
            ? await this.recalculateMandays(
                projectId,
                this.parseJson<SnapshotData>(snapshot.data_json, {}),
            )
            : currentMandays;

        await this.prisma.$transaction(async (tx) => {
            await tx.surveillance_information_snapshots.update({
                where: { id: snapshot.id },
                data: {
                    status: 'REVIEWED',
                    manday_decision: dto.decision,
                    effective_mandays: effectiveMandays,
                    note: reviewNote,
                },
            });
            if (dto.decision === 'RECALCULATED') {
                await tx.audit_program_events.update({
                    where: { id: eventId },
                    data: { planned_mandays: effectiveMandays },
                });
            }

            await this.workItems?.completeMatchingWorkItems(
                {
                    actionCode:
                        WORK_ITEM_ACTIONS.SURVEILLANCE_CHANGE_REVIEW,
                    entityType:
                        'surveillance_information_snapshot',
                    entityId:
                        snapshot.id,
                },
                _actorId,
                tx,
            );
        });

        return this.response(projectId, eventId);
    }
}

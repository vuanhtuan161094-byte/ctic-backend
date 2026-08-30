import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    existsSync,
    mkdirSync,
    unlinkSync,
} from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

import { DocumentFilesService } from '../document-files/document-files.service';
import { getStorageConfig } from '../common/storage-config';
import { convertDocxToPdf } from '../common/document-conversion';
import { PrismaService } from '../prisma/prisma.service';

type OoxmlTemplateEngine = {
    renderDocxTemplate(input: {
        templatePath: string;
        outputPath: string;
        data: Record<string, unknown>;
    }): string;
};

function loadOoxmlTemplateEngine(): OoxmlTemplateEngine {
    const filename = 'ooxml-template-engine.cjs';
    const candidates = [
        join(__dirname, 'runtime', filename),
        join(
            process.cwd(),
            'dist',
            'reports',
            'runtime',
            filename,
        ),
        join(
            process.cwd(),
            'src',
            'reports',
            'runtime',
            filename,
        ),
    ];

    const runtimePath = candidates.find((candidate) =>
        existsSync(candidate),
    );

    if (!runtimePath) {
        throw new Error(
            `Không tìm thấy OOXML template engine. Đã kiểm tra: ${candidates.join(', ')}`,
        );
    }

    return require(runtimePath) as OoxmlTemplateEngine;
}

const templateEngine = loadOoxmlTemplateEngine();

type DocumentFormat = 'docx' | 'pdf';
type JsonObject = Record<string, unknown>;

interface ReportDocumentDefinition {
    templateFile: string;
    formCode: string;
    documentType: string;
    label: string;
    stage: 'stage1' | 'stage2';
}

@Injectable()
export class ReportDocumentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly documentFilesService: DocumentFilesService,
    ) { }

    private readonly uploadDirectory =
        getStorageConfig()
            .documentsDirectory;

    private normalize(value: unknown): string {
        return String(value ?? '')
            .trim()
            .toLowerCase()
            .replace(/[\s_-]+/g, '');
    }

    private displayText(
        value: unknown,
        fallback = '—',
    ): string {
        if (value === null || value === undefined) {
            return fallback;
        }

        const text = String(value).trim();
        return text || fallback;
    }

    private isPlainObject(
        value: unknown,
    ): value is JsonObject {
        return Boolean(
            value &&
            typeof value === 'object' &&
            !Array.isArray(value),
        );
    }

    private parseJson(
        value: string | null | undefined,
    ): JsonObject {
        if (!value) {
            return {};
        }

        try {
            const parsed = JSON.parse(value) as unknown;
            return this.isPlainObject(parsed)
                ? parsed
                : {};
        } catch {
            return {};
        }
    }

    private nested(
        root: JsonObject,
        ...path: string[]
    ): unknown {
        let current: unknown = root;

        for (const key of path) {
            if (!this.isPlainObject(current)) {
                return null;
            }
            current = current[key];
        }

        return current;
    }

    private formatDate(
        value: Date | string | null | undefined,
    ): string {
        if (!value) {
            return '—';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '—';
        }

        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: 'Asia/Ho_Chi_Minh',
        }).format(date);
    }

    private formatDateRange(
        start: Date | string | null | undefined,
        end: Date | string | null | undefined,
    ): string {
        const startText = this.formatDate(start);
        const endText = this.formatDate(end);

        if (startText === endText) {
            return startText;
        }

        return `${startText} - ${endText}`;
    }

    private formatMandays(value: number): string {
        return `${value.toFixed(1).replace('.', ',')} man-day`;
    }

    private decimalNumber(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private definitionForAuditType(
        auditType: unknown,
    ): ReportDocumentDefinition {
        const normalized = this.normalize(auditType);
        const isStage1 = [
            'stage1',
            'initialstage1',
            'gđ1',
            'gd1',
        ].includes(normalized);

        if (isStage1) {
            return {
                templateFile:
                    'F.09-P.09-01.audit-report-stage-1.template.docx',
                formCode: 'F.09-P.09-01',
                documentType: 'stage1_audit_report',
                label: 'Báo cáo đánh giá giai đoạn 1',
                stage: 'stage1',
            };
        }

        return {
            templateFile:
                'F.09-P.09-02.audit-report-stage-2.template.docx',
            formCode: 'F.09-P.09-02',
            documentType: 'stage2_audit_report',
            label: 'Báo cáo đánh giá chứng nhận',
            stage: 'stage2',
        };
    }

    private auditTypeLabel(
        auditType: unknown,
    ): string {
        const normalized = this.normalize(auditType);
        const labels: Record<string, string> = {
            stage1:
                'Đánh giá chứng nhận lần đầu - Giai đoạn 1',
            initialstage1:
                'Đánh giá chứng nhận lần đầu - Giai đoạn 1',
            stage2:
                'Đánh giá chứng nhận lần đầu - Giai đoạn 2',
            initialstage2:
                'Đánh giá chứng nhận lần đầu - Giai đoạn 2',
            surveillance1:
                'Đánh giá giám sát lần 1',
            surveillance2:
                'Đánh giá giám sát lần 2',
            recertification:
                'Đánh giá tái chứng nhận',
            scopeextension:
                'Đánh giá mở rộng phạm vi',
            special:
                'Đánh giá đặc biệt',
        };

        return labels[normalized] ??
            this.displayText(auditType, 'Đánh giá chứng nhận');
    }

    private teamRoleLabel(role: unknown): string {
        const labels: Record<string, string> = {
            teamleader: 'Trưởng đoàn đánh giá',
            leadauditor: 'Trưởng đoàn đánh giá',
            auditor: 'Chuyên gia đánh giá',
            technicalexpert: 'Chuyên gia kỹ thuật',
            observer: 'Quan sát viên',
            trainee: 'Chuyên gia tập sự',
            witnessevaluator: 'Đánh giá viên chứng kiến',
        };

        return labels[this.normalize(role)] ??
            this.displayText(role, 'Thành viên đoàn');
    }

    private findingGradeLabel(type: unknown): string {
        const labels: Record<string, string> = {
            majornc: 'NC nặng',
            minornc: 'NC nhẹ',
            ofi: 'OFI',
            observation: 'Quan sát',
            conformity: 'Điểm phù hợp',
        };

        return labels[this.normalize(type)] ??
            this.displayText(type);
    }

    private recommendationLabel(value: unknown): string {
        const normalized = this.normalize(value);
        if (normalized === 'certificationrecommended') {
            return 'Đề nghị cấp/duy trì chứng nhận';
        }
        if (normalized === 'certificationnotrecommended') {
            return 'Không đề nghị cấp/duy trì chứng nhận';
        }
        return this.displayText(value, 'Chưa kết luận');
    }

    private documentStatusLabel(status: unknown): string {
        const normalized = this.normalize(status);
        const labels: Record<string, string> = {
            draft: 'DỰ THẢO / DRAFT',
            correctiveactionrequired:
                'CHỜ KHẮC PHỤC NC / CORRECTIVE ACTION REQUIRED',
            readyfortechnicalreview:
                'ĐÃ NỘP / SUBMITTED',
            completed: 'HOÀN THÀNH / COMPLETED',
            approved: 'ĐÃ PHÊ DUYỆT / APPROVED',
            technicalreviewcompleted:
                'ĐÃ THẨM XÉT / TECHNICALLY REVIEWED',
        };

        return labels[normalized] ??
            this.displayText(status, 'DỰ THẢO / DRAFT');
    }

    private safeFileSegment(value: unknown): string {
        return this.displayText(value, 'NA')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9._-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'NA';
    }

    private templatePath(filename: string): string {
        const candidates = [
            join(__dirname, 'templates', filename),
            join(
                process.cwd(),
                'src',
                'reports',
                'templates',
                filename,
            ),
        ];

        const found = candidates.find((candidate) =>
            existsSync(candidate),
        );

        if (!found) {
            throw new NotFoundException(
                `Không tìm thấy mẫu Word ${filename}`,
            );
        }

        return found;
    }

    private async assertGenerationAccess(
        userId: string | undefined,
        auditPlanId: string,
    ) {
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được người xuất báo cáo',
            );
        }

        const user = await this.prisma.users.findUnique({
            where: {
                id: userId,
            },
            include: {
                user_roles: {
                    include: {
                        roles: true,
                    },
                },
                expert_profile: {
                    select: {
                        id: true,
                    },
                },
            },
        });

        if (!user) {
            throw new ForbiddenException(
                'Không tìm thấy tài khoản người xuất báo cáo',
            );
        }

        const roles = user.user_roles.map((item) =>
            this.normalize(item.roles.role_name),
        );

        if (roles.some((role) =>
            ['admin', 'staff'].includes(role),
        )) {
            return;
        }

        const expertId = user.expert_profile?.id;
        const appointment =
            await this.prisma.audit_team_appointments.findUnique({
                where: {
                    audit_plan_id: auditPlanId,
                },
                include: {
                    members: {
                        select: {
                            expert_id: true,
                        },
                    },
                },
            });

        if (
            !expertId ||
            !appointment?.members.some(
                (member) => member.expert_id === expertId,
            )
        ) {
            throw new ForbiddenException(
                'Chỉ thành viên được phân công trong đoàn đánh giá mới được xuất báo cáo',
            );
        }
    }

    private async loadReport(id: string) {
        const report = await this.prisma.reports.findUnique({
            where: {
                id,
            },
            include: {
                preparer: {
                    select: {
                        id: true,
                        full_name: true,
                        username: true,
                        email: true,
                    },
                },
                audit_findings: {
                    orderBy: [
                        {
                            detected_date: 'asc',
                        },
                        {
                            finding_code: 'asc',
                        },
                    ],
                },
                audit_plans: {
                    include: {
                        audit_event: {
                            include: {
                                audit_programs: true,
                            },
                        },
                        audit_team_appointment: {
                            include: {
                                members: {
                                    include: {
                                        experts: true,
                                        scopes: true,
                                    },
                                    orderBy: {
                                        created_at: 'asc',
                                    },
                                },
                            },
                        },
                        certification_projects: {
                            include: {
                                contracts: true,
                                certification_agreements: true,
                                certification_applications: {
                                    include: {
                                        sites: true,
                                        customers: {
                                            include: {
                                                contacts: true,
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

        if (!report) {
            throw new NotFoundException(
                'Không tìm thấy báo cáo đánh giá',
            );
        }

        return report;
    }

    private buildSnapshot(report: any) {
        const plan = report.audit_plans;
        const project = plan.certification_projects;
        const application = project.certification_applications;
        const customer = application.customers;
        const program = plan.audit_event?.audit_programs;
        const appointment = plan.audit_team_appointment;
        const formData = this.parseJson(report.form_data);
        const auditType =
            plan.audit_type ??
            plan.audit_event?.event_type ??
            'stage2';
        const definition = this.definitionForAuditType(auditType);

        const members = appointment?.members ?? [];
        const auditTeam = members.map(
            (member: any, index: number) => ({
                team: {
                    no: index + 1,
                    full_name: this.displayText(
                        member.experts?.full_name,
                    ),
                    code: this.displayText(
                        member.experts?.employee_code,
                    ),
                    role: this.teamRoleLabel(
                        member.team_role,
                    ),
                    contact: this.displayText(
                        member.experts?.phone ??
                        member.experts?.email,
                    ),
                },
            }),
        );

        const teamLeaderMember =
            members.find((member: any) =>
                ['teamleader', 'leadauditor'].includes(
                    this.normalize(member.team_role),
                ),
            ) ?? members[0];

        const representatives: Array<{
            full_name: string;
            position: string;
        }> = [];
        const seenRepresentatives = new Set<string>();

        const addRepresentative = (
            fullName: unknown,
            position: unknown,
        ) => {
            const name = this.displayText(fullName, '');
            if (!name) {
                return;
            }

            const key = this.normalize(name);
            if (seenRepresentatives.has(key)) {
                return;
            }

            seenRepresentatives.add(key);
            representatives.push({
                full_name: name,
                position: this.displayText(position),
            });
        };

        addRepresentative(
            application.representative_name,
            application.representative_position,
        );
        addRepresentative(
            application.contact_name,
            application.contact_position,
        );
        for (const contact of customer.contacts ?? []) {
            addRepresentative(
                contact.full_name,
                contact.position,
            );
        }

        const clientRepresentatives =
            representatives.length
                ? representatives.map((representative, index) => ({
                    representative: {
                        no: index + 1,
                        ...representative,
                    },
                }))
                : [{
                    representative: {
                        no: 1,
                        full_name: '—',
                        position: '—',
                    },
                }];

        const findings = report.audit_findings.map(
            (finding: any, index: number) => {
                const parts = [
                    finding.requirement
                        ? `Yêu cầu: ${finding.requirement}`
                        : null,
                    finding.description,
                    finding.objective_evidence
                        ? `Bằng chứng khách quan: ${finding.objective_evidence}`
                        : null,
                ].filter(Boolean);

                return {
                    finding: {
                        no: index + 1,
                        content: parts.join('\n'),
                        clause: this.displayText(finding.clause),
                        grade: this.findingGradeLabel(
                            finding.finding_type,
                        ),
                        code: this.displayText(
                            finding.finding_code,
                        ),
                    },
                };
            },
        );

        const executionSummary = this.displayText(
            this.nested(
                formData,
                'audit_execution',
                'summary',
            ),
        );
        const implementationSummary = this.displayText(
            this.nested(
                formData,
                'management_system',
                'implementation_summary',
            ),
        );
        const effectivenessSummary = this.displayText(
            this.nested(
                formData,
                'management_system',
                'effectiveness_summary',
            ),
        );
        const internalAuditSummary = this.displayText(
            this.nested(
                formData,
                'management_system',
                'internal_audit_summary',
            ),
        );
        const managementReviewSummary = this.displayText(
            this.nested(
                formData,
                'management_system',
                'management_review_summary',
            ),
        );
        const limitations = this.displayText(
            this.nested(
                formData,
                'audit_execution',
                'limitations',
            ),
            'Không có/ None',
        );
        const significantChanges = this.displayText(
            this.nested(
                formData,
                'audit_execution',
                'significant_changes',
            ),
            'Không có/ None',
        );
        const recommendationResult = this.nested(
            formData,
            'recommendation',
            'result',
        );
        const recommendationRationale = this.displayText(
            this.nested(
                formData,
                'recommendation',
                'rationale',
            ),
        );

        const stage1Report = this.isPlainObject(formData.stage1_report)
            ? formData.stage1_report
            : {};
        const stage1ContentRows = Array.isArray(stage1Report.audit_content)
            ? stage1Report.audit_content
            : [];

        const stage1Items = stage1ContentRows.length
            ? stage1ContentRows.map((entry: unknown, index: number) => {
                const row = this.isPlainObject(entry) ? entry : {};
                return {
                    item: {
                        no: Number(row.no ?? index + 1),
                        topic: this.displayText(row.content),
                        note: this.displayText(row.audit_note),
                        comment: this.displayText(row.comment),
                    },
                };
            })
            : [{
                item: {
                    no: 1,
                    topic: 'Chưa có nội dung đánh giá Giai đoạn 1',
                    note: '—',
                    comment: '—',
                },
            }];

        const stage2Report = this.isPlainObject(formData.stage2_report)
            ? formData.stage2_report
            : {};
        const auditTeamRecommendation = this.displayText(
            stage2Report.audit_team_recommendation,
        );
        const clientRecommendation = this.displayText(
            stage2Report.client_recommendation,
            '—',
        );

        const countedRoles = new Set([
            'teamleader',
            'leadauditor',
            'auditor',
        ]);

        const actualMandays = members.reduce(
            (total: number, member: any) => {
                if (!countedRoles.has(
                    this.normalize(member.team_role),
                )) {
                    return total;
                }

                return total + this.decimalNumber(
                    member.actual_mandays ??
                    member.planned_mandays,
                );
            },
            0,
        );

        const fallbackMandays = this.decimalNumber(
            plan.audit_event?.actual_mandays ??
            plan.audit_event?.planned_mandays,
        );

        const mandays = actualMandays > 0
            ? actualMandays
            : fallbackMandays;

        const primaryRepresentative = representatives[0] ?? {
            full_name: '—',
            position: '—',
        };

        const snapshot = {
            customer_code:
                program?.customer_code ??
                customer.customer_code,
            organization_name_vi:
                program?.organization_name ??
                customer.company_name,
            organization_name_en:
                application.company_name_en ??
                customer.company_name,
            organization_address:
                application.headquarters_address ??
                program?.address ??
                customer.address,
            contact_name:
                application.contact_name ??
                application.representative_name,
            contact_position:
                application.contact_position ??
                application.representative_position,
            contact_phone:
                application.contact_phone ??
                application.representative_phone ??
                customer.phone,
            contact_email:
                application.contact_email ??
                application.representative_email ??
                customer.email,
            audit_location:
                plan.location ??
                application.sites?.[0]?.address ??
                application.headquarters_address ??
                customer.address,
            certification_scope:
                plan.audit_scope ??
                program?.certification_scope ??
                application.certification_scope,
            audit_objectives: plan.audit_objectives,
            audit_type_label: this.auditTypeLabel(auditType),
            standard_name:
                program?.standard_name ??
                project.standard_name ??
                application.standard_name,
            audit_criteria: plan.audit_criteria,
            audit_dates: this.formatDateRange(
                report.audit_start_date ??
                plan.planned_start_date,
                report.audit_end_date ??
                plan.planned_end_date,
            ),
            audit_mandays: this.formatMandays(mandays),
            audit_language: this.displayText(
                this.nested(
                    formData,
                    'audit_information',
                    'language',
                ),
                'Tiếng Việt',
            ),
            document_status: this.documentStatusLabel(
                report.status,
            ),
            audit_team: auditTeam.length
                ? auditTeam
                : [{
                    team: {
                        no: 1,
                        full_name: '—',
                        code: '—',
                        role: '—',
                        contact: '—',
                    },
                }],
            client_representatives: clientRepresentatives,
            findings: findings.length
                ? findings
                : [{
                    finding: {
                        no: 1,
                        content: 'Không ghi nhận phát hiện/ No finding recorded.',
                        clause: '—',
                        grade: '—',
                        code: '—',
                    },
                }],
            stage1_items: stage1Items,
            execution_summary: executionSummary,
            implementation_summary: implementationSummary,
            effectiveness_summary: effectivenessSummary,
            internal_audit_summary: internalAuditSummary,
            management_review_summary: managementReviewSummary,
            limitations,
            significant_changes: significantChanges,
            conclusion: this.displayText(report.conclusion),
            recommendation_label:
                this.recommendationLabel(
                    recommendationResult,
                ),
            recommendation_rationale: recommendationRationale,
            audit_team_recommendation: auditTeamRecommendation,
            client_recommendation: clientRecommendation,
            auditee_representative_name:
                primaryRepresentative.full_name,
            auditee_representative_position:
                primaryRepresentative.position,
            team_leader_name: this.displayText(
                teamLeaderMember?.experts?.full_name,
            ),
            team_leader_role: this.teamRoleLabel(
                teamLeaderMember?.team_role,
            ),
        };

        const missingFields: string[] = [];
        const required: Array<[string, unknown]> = [
            ['Tên tổ chức', snapshot.organization_name_vi],
            ['Địa chỉ tổ chức', snapshot.organization_address],
            ['Phạm vi chứng nhận', snapshot.certification_scope],
            ['Tiêu chuẩn', snapshot.standard_name],
            ['Ngày đánh giá', report.audit_start_date ?? plan.planned_start_date],
        ];

        if (definition.stage === 'stage1') {
            required.push(['Kết luận Giai đoạn 1', report.conclusion]);
            if (!stage1ContentRows.length) {
                missingFields.push('Nội dung đánh giá Giai đoạn 1');
            }
        } else {
            required.push(['Kiến nghị của đoàn đánh giá', auditTeamRecommendation]);
        }

        for (const [label, value] of required) {
            if (!value || String(value).trim() === '') {
                missingFields.push(label);
            }
        }

        return {
            definition,
            report,
            snapshot,
            preview: {
                form_code: definition.formCode,
                document_type: definition.documentType,
                label: definition.label,
                report_id: report.id,
                report_code: report.report_code,
                report_version: report.version_no,
                status: report.status,
                plan_code: plan.plan_code,
                project_code: project.project_code,
                customer_code: snapshot.customer_code,
                organization_name: snapshot.organization_name_vi,
                standard_name: snapshot.standard_name,
                certification_scope: snapshot.certification_scope,
                audit_dates: snapshot.audit_dates,
                audit_mandays: snapshot.audit_mandays,
                team_count: auditTeam.length,
                finding_count: report.audit_findings.length,
                missing_fields: missingFields,
                can_generate: true,
            },
        };
    }

    async preview(id: string) {
        const report = await this.loadReport(id);
        const built = this.buildSnapshot(report);
        return built.preview;
    }

    private async convertToPdf(
        docxPath: string,
        pdfPath: string,
    ) {
        await convertDocxToPdf(
            docxPath,
            pdfPath,
            120_000,
        );
    }

    async generate(
        id: string,
        format: string,
        userId?: string,
    ) {
        const normalizedFormat = String(format ?? '')
            .trim()
            .toLowerCase() as DocumentFormat;

        if (!['docx', 'pdf'].includes(normalizedFormat)) {
            throw new BadRequestException(
                'Định dạng chỉ chấp nhận docx hoặc pdf',
            );
        }

        const report = await this.loadReport(id);
        await this.assertGenerationAccess(
            userId,
            report.audit_plan_id,
        );

        const built = this.buildSnapshot(report);
        if (built.preview.missing_fields.length > 0) {
            throw new BadRequestException(
                `Không thể sinh báo cáo khi còn thiếu trường bắt buộc: ${built.preview.missing_fields.join(', ')}`,
            );
        }
        const templatePath = this.templatePath(
            built.definition.templateFile,
        );

        mkdirSync(this.uploadDirectory, {
            recursive: true,
        });

        const storedBaseName = randomUUID();
        const docxStoredName = `${storedBaseName}.docx`;
        const pdfStoredName = `${storedBaseName}.pdf`;
        const docxPath = join(
            this.uploadDirectory,
            docxStoredName,
        );
        const pdfPath = join(
            this.uploadDirectory,
            pdfStoredName,
        );

        templateEngine.renderDocxTemplate({
            templatePath,
            outputPath: docxPath,
            data: built.snapshot,
        });

        const sourceName = [
            built.definition.formCode,
            this.safeFileSegment(
                built.snapshot.customer_code,
            ),
            this.safeFileSegment(
                report.report_code,
            ),
            `R${report.version_no}`,
        ].join('_');

        try {
            if (normalizedFormat === 'docx') {
                const document =
                    await this.documentFilesService.registerGenerated({
                        entity_type: 'report',
                        entity_id: report.id,
                        document_type:
                            built.definition.documentType,
                        file_kind: 'generated_docx',
                        original_name: `${sourceName}.docx`,
                        stored_name: docxStoredName,
                        absolute_path: docxPath,
                        mime_type:
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        note:
                            `${built.definition.label} sinh tự động từ dữ liệu báo cáo ${report.report_code ?? report.id}.`,
                        uploaded_by: userId ?? null,
                    });

                return {
                    format: normalizedFormat,
                    preview: built.preview,
                    document,
                };
            }

            await this.convertToPdf(
                docxPath,
                pdfPath,
            );

            if (existsSync(docxPath)) {
                unlinkSync(docxPath);
            }

            const document =
                await this.documentFilesService.registerGenerated({
                    entity_type: 'report',
                    entity_id: report.id,
                    document_type:
                        built.definition.documentType,
                    file_kind: 'generated_pdf',
                    original_name: `${sourceName}.pdf`,
                    stored_name: pdfStoredName,
                    absolute_path: pdfPath,
                    mime_type: 'application/pdf',
                    note:
                        `${built.definition.label} PDF sinh từ cùng snapshot Word của báo cáo ${report.report_code ?? report.id}.`,
                    uploaded_by: userId ?? null,
                });

            return {
                format: normalizedFormat,
                preview: built.preview,
                document,
            };
        } catch (error) {
            if (existsSync(docxPath)) {
                unlinkSync(docxPath);
            }
            if (existsSync(pdfPath)) {
                unlinkSync(pdfPath);
            }
            throw error;
        }
    }
}

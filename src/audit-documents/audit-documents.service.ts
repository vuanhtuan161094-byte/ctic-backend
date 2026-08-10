import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { randomUUID } from 'crypto';
import {
    existsSync,
    mkdirSync,
    unlinkSync,
} from 'fs';
import { join } from 'path';

import { DocumentFilesService } from '../document-files/document-files.service';
import { getPlatformBranding } from '../common/platform-branding';
import { getStorageConfig } from '../common/storage-config';
import { convertDocxToPdf } from '../common/document-conversion';

import { PrismaService } from '../prisma/prisma.service';

import { SaveAuditDocumentDataDto } from './dto/save-audit-document-data.dto';
import {
    CHECKLIST_LIBRARIES,
    ChecklistLibraryDefinition,
    ChecklistResult,
} from './checklist-libraries';

const ALLOWED_DOCUMENT_TYPES = new Set([
    'audit_program_f03',
    'audit_team_assignment_f04',
    'audit_plan_f05',
    'audit_attendance_f07',
    'audit_log_f15',
    'audit_monitoring_f17',
    'audit_checklist_f06',
    'corrective_action_request_f10',
    'technical_review_report_f11',
]);

const ALLOWED_FORMATS = new Set([
    'docx',
    'pdf',
]);

const COUNTED_MANDAY_ROLES = new Set([
    'teamleader',
    'leadauditor',
    'auditor',
]);

type JsonObject = Record<string, unknown>;
type DocumentFormat = 'docx' | 'pdf';

type OoxmlTemplateEngine = {
    renderDocxTemplate(input: {
        templatePath: string;
        outputPath: string;
        data: Record<string, unknown>;
    }): string;
};

interface AuditDocumentDefinition {
    requestType: string;
    formCode: string;
    label: string;
    templateFile: string;
    entityType: string;
    entityId: string;
    documentType: string;
    memberId?: string;
    programKey?: string;
    findingId?: string;
    fileNameSuffix?: string;
}

function loadOoxmlTemplateEngine(): OoxmlTemplateEngine {
    const filename = 'ooxml-template-engine.cjs';
    const candidates = [
        join(__dirname, '..', 'reports', 'runtime', filename),
        join(process.cwd(), 'dist', 'reports', 'runtime', filename),
        join(process.cwd(), 'src', 'reports', 'runtime', filename),
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

@Injectable()
export class AuditDocumentsService {
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

    private decimalNumber(value: unknown): number {
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    private isPlainObject(value: unknown): value is JsonObject {
        return Boolean(
            value &&
            typeof value === 'object' &&
            !Array.isArray(value),
        );
    }

    private parseJson(value: string | null | undefined): JsonObject {
        if (!value) {
            return {};
        }

        try {
            const parsed = JSON.parse(value) as unknown;
            return this.isPlainObject(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }

    private deepMerge(base: JsonObject, override: JsonObject): JsonObject {
        const result: JsonObject = { ...base };

        for (const [key, value] of Object.entries(override)) {
            if (
                this.isPlainObject(result[key]) &&
                this.isPlainObject(value)
            ) {
                result[key] = this.deepMerge(
                    result[key] as JsonObject,
                    value,
                );
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    private nested(root: JsonObject, ...path: string[]): unknown {
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

    private formatMonth(
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

    private formatMandays(value: unknown): string {
        const mandays = this.decimalNumber(value);
        return `${mandays.toFixed(1).replace('.', ',')} MD`;
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

    private teamRoleLabel(role: unknown): string {
        const labels: Record<string, string> = {
            teamleader: 'Chuyên gia đánh giá - Trưởng đoàn',
            leadauditor: 'Chuyên gia đánh giá - Trưởng đoàn',
            auditor: 'Chuyên gia đánh giá',
            technicalexpert: 'Chuyên gia kỹ thuật',
            observer: 'Quan sát viên',
            trainee: 'Chuyên gia tập sự',
            witnessevaluator: 'Đánh giá viên chứng kiến',
        };

        return labels[this.normalize(role)] ??
            this.displayText(role, 'Thành viên đoàn');
    }

    private auditTypeLabel(value: unknown): string {
        const labels: Record<string, string> = {
            initial: 'Đánh giá chứng nhận lần đầu',
            stage1: 'Đánh giá chứng nhận lần đầu - Giai đoạn 1',
            initialstage1: 'Đánh giá chứng nhận lần đầu - Giai đoạn 1',
            stage2: 'Đánh giá chứng nhận lần đầu - Giai đoạn 2',
            initialstage2: 'Đánh giá chứng nhận lần đầu - Giai đoạn 2',
            surveillance: 'Đánh giá giám sát',
            surveillance1: 'Đánh giá giám sát lần 1',
            surveillance2: 'Đánh giá giám sát lần 2',
            recertification: 'Đánh giá tái chứng nhận',
            scopeextension: 'Đánh giá mở rộng phạm vi',
            special: 'Đánh giá đặc biệt',
        };

        return labels[this.normalize(value)] ??
            this.displayText(value, 'Đánh giá chứng nhận');
    }

    private auditPlanTitle(value: unknown): string {
        const normalized = this.normalize(value);
        if (['stage1', 'initialstage1'].includes(normalized)) {
            return 'KẾ HOẠCH ĐÁNH GIÁ GIAI ĐOẠN 1/ AUDIT PLAN STAGE 1';
        }

        if (['stage2', 'initialstage2'].includes(normalized)) {
            return 'KẾ HOẠCH ĐÁNH GIÁ GIAI ĐOẠN 2/ AUDIT PLAN STAGE 2';
        }

        return `KẾ HOẠCH ${this.auditTypeLabel(value).toUpperCase()}/ AUDIT PLAN`;
    }

    private eventTypeLabel(value: unknown): string {
        const labels: Record<string, string> = {
            stage1: 'Giai đoạn 1/ Stage 1',
            initialstage1: 'Giai đoạn 1/ Stage 1',
            stage2: 'Giai đoạn 2/ Stage 2',
            initialstage2: 'Giai đoạn 2/ Stage 2',
            surveillance: 'Giám sát/ Surveillance',
            surveillance1: 'Giám sát 1/ Surveillance 1',
            surveillance2: 'Giám sát 2/ Surveillance 2',
            recertification: 'Tái chứng nhận/ Recertification',
            scopeextension: 'Mở rộng phạm vi/ Scope extension',
            special: 'Đánh giá đặc biệt/ Special audit',
        };

        return labels[this.normalize(value)] ??
            this.displayText(value, 'Kỳ đánh giá/ Audit event');
    }

    private certificationTypeLabel(value: unknown): string {
        const labels: Record<string, string> = {
            initial: '☑ Chứng nhận lần đầu/ Initial certification',
            initialcertification: '☑ Chứng nhận lần đầu/ Initial certification',
            recertification: '☑ Tái chứng nhận/ Re-certification',
            transfer: '☑ Chứng nhận chuyển đổi/ Transfer certification',
            extension: '☑ Mở rộng chứng nhận/ Scope extension',
        };

        return labels[this.normalize(value)] ??
            this.displayText(value, '☑ Chứng nhận lần đầu/ Initial certification');
    }

    private certificationTypeMarks(value: unknown) {
        const normalized = this.normalize(value);
        const isInitial = !normalized || [
            'initial',
            'initialcertification',
            'new',
        ].includes(normalized);
        const isExtension = [
            'extension',
            'scopeextension',
            'expansion',
            'expandingcertification',
        ].includes(normalized);
        const isTransfer = [
            'transfer',
            'transferringcertification',
        ].includes(normalized);
        const isRecertification = [
            'recertification',
            'renewal',
        ].includes(normalized);
        const isOther = Boolean(normalized) &&
            !isInitial &&
            !isExtension &&
            !isTransfer &&
            !isRecertification;

        return {
            cert_initial_mark: isInitial ? '☑' : '☐',
            cert_extension_mark: isExtension ? '☑' : '☐',
            cert_transfer_mark: isTransfer ? '☑' : '☐',
            cert_recert_mark: isRecertification ? '☑' : '☐',
            cert_other_mark: isOther ? '☑' : '☐',
        };
    }

    private brandingSnapshot() {
        const branding = getPlatformBranding();

        return {
            certification_body_short_name:
                branding.certificationBodyShortName,
            certification_body_name:
                branding.certificationBodyName,
            certification_body_website:
                branding.certificationBodyWebsite,
            certification_body_email:
                branding.certificationBodyEmail,
            certification_body_phone:
                branding.certificationBodyPhone,
            certification_body_address:
                branding.certificationBodyAddress,
        };
    }

    private templatePath(filename: string): string {
        const candidates = [
            join(__dirname, '..', 'reports', 'templates', filename),
            join(process.cwd(), 'dist', 'reports', 'templates', filename),
            join(process.cwd(), 'src', 'reports', 'templates', filename),
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

    private async loadPlan(planId: string) {
        const plan = await this.prisma.audit_plans.findUnique({
            where: {
                id: planId,
            },
            include: {
                certification_projects: {
                    include: {
                        contracts: true,
                        certification_agreements: true,
                        audit_plans: {
                            where: {
                                audit_type: 'project_team',
                            },
                            orderBy: {
                                created_at: 'desc',
                            },
                            include: {
                                audit_team_appointment: {
                                    include: {
                                        prepared_by_user: true,
                                        approved_by_user: true,
                                        members: {
                                            include: {
                                                experts: true,
                                            },
                                            orderBy: {
                                                created_at: 'asc',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        certification_applications: {
                            include: {
                                sites: {
                                    orderBy: {
                                        site_no: 'asc',
                                    },
                                },
                                customers: {
                                    include: {
                                        contacts: true,
                                    },
                                },
                            },
                        },
                    },
                },
                audit_event: {
                    include: {
                        audit_programs: true,
                    },
                },
                audit_team_appointment: {
                    include: {
                        prepared_by_user: true,
                        approved_by_user: true,
                        members: {
                            include: {
                                experts: true,
                                program_mandays: true,
                            },
                            orderBy: {
                                created_at: 'asc',
                            },
                        },
                    },
                },
            },
        });

        if (!plan) {
            throw new NotFoundException(
                'Không tìm thấy kế hoạch đánh giá',
            );
        }

        return plan as any;
    }

    private async loadProgram(programId: string | null | undefined) {
        if (!programId) {
            return null;
        }

        return this.prisma.audit_programs.findUnique({
            where: {
                id: programId,
            },
            include: {
                preparer: true,
                events: {
                    orderBy: {
                        sequence_no: 'asc',
                    },
                    include: {
                        audit_plans: {
                            orderBy: {
                                version_no: 'desc',
                            },
                            include: {
                                reports: {
                                    orderBy: {
                                        version_no: 'desc',
                                    },
                                    include: {
                                        audit_findings: true,
                                    },
                                },
                                audit_team_appointment: {
                                    include: {
                                        members: {
                                            include: {
                                                experts: true,
                                            },
                                            orderBy: {
                                                created_at: 'asc',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }) as Promise<any>;
    }

    private async assertGenerationAccess(
        userId: string | undefined,
        plan: any,
    ) {
        if (!userId) {
            throw new ForbiddenException(
                'Không xác định được người xuất tài liệu',
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
                'Không tìm thấy tài khoản người xuất tài liệu',
            );
        }

        const roles = user.user_roles.map((item) =>
            this.normalize(item.roles.role_name),
        );

        if (roles.some((role) =>
            ['admin', 'staff', 'coordinator', 'technicalreviewer', 'decisionmaker'].includes(role),
        )) {
            return;
        }

        const expertId = user.expert_profile?.id;
        const projectAppointment =
            this.projectTeamAppointment(plan);
        const members = [
            ...(plan.audit_team_appointment?.members ?? []),
            ...(projectAppointment?.members ?? []),
        ];
        if (
            !expertId ||
            !members.some((member: any) =>
                member.expert_id === expertId,
            )
        ) {
            throw new ForbiddenException(
                'Chỉ điều phối viên hoặc thành viên được phân công mới được xuất hồ sơ đánh giá',
            );
        }
    }

    private teamRows(appointment: any) {
        const members = appointment?.members ?? [];
        return members.length
            ? members.map((member: any, index: number) => ({
                team: {
                    no: index + 1,
                    full_name: this.displayText(
                        member.experts?.full_name,
                    ),
                    code: this.displayText(
                        member.experts?.employee_code,
                    ),
                    role: this.teamRoleLabel(member.team_role),
                    contact: this.displayText(
                        member.experts?.phone ??
                        member.experts?.email,
                    ),
                },
            }))
            : [{
                team: {
                    no: 1,
                    full_name: '—',
                    code: '—',
                    role: '—',
                    contact: '—',
                },
            }];
    }

    private teamLeader(appointment: any) {
        const members = appointment?.members ?? [];
        return members.find((member: any) =>
            ['teamleader', 'leadauditor'].includes(
                this.normalize(member.team_role),
            ),
        ) ?? members[0] ?? null;
    }

    private projectTeamAppointment(plan: any) {
        const projectPlans =
            plan.certification_projects?.audit_plans ?? [];
        for (const projectPlan of projectPlans) {
            const appointment =
                projectPlan.audit_team_appointment;
            if (
                appointment &&
                this.normalize(appointment.status) !== 'cancelled'
            ) {
                return appointment;
            }
        }
        return null;
    }

    private planDocumentData(plan: any) {
        const formData = this.parseJson(plan.form_data);
        const stored = this.nested(
            formData,
            'document_generation',
        );
        return this.isPlainObject(stored) ? stored : {};
    }

    private defaultSchedule(plan: any) {
        const leader = this.teamLeader(
            plan.audit_team_appointment,
        );
        const leaderName = this.displayText(
            leader?.experts?.full_name,
            'Đoàn đánh giá',
        );
        const auditType = this.normalize(
            plan.audit_type ?? plan.audit_event?.event_type,
        );

        if (['stage1', 'initialstage1'].includes(auditType)) {
            return [
                {
                    time: 'Bắt đầu cuộc đánh giá',
                    content:
                        'Họp khai mạc; xác nhận mục tiêu, phạm vi, tiêu chí, phương pháp và kế hoạch đánh giá.',
                    auditor: leaderName,
                    auditee: 'Ban lãnh đạo/ Người liên hệ',
                },
                {
                    time: 'Theo lịch làm việc',
                    content:
                        'Xem xét hệ thống tài liệu, điều kiện địa điểm, mức độ sẵn sàng, đánh giá nội bộ, xem xét của lãnh đạo và các nội dung cần chuẩn bị cho Giai đoạn 2.',
                    auditor: leaderName,
                    auditee: 'Đại diện hệ thống quản lý/ Các bộ phận liên quan',
                },
                {
                    time: 'Kết thúc cuộc đánh giá',
                    content:
                        'Tổng hợp kết quả; thông báo điểm cần hoàn thiện và kết luận về mức độ sẵn sàng cho Giai đoạn 2.',
                    auditor: leaderName,
                    auditee: 'Ban lãnh đạo/ Người liên hệ',
                },
            ];
        }

        return [
            {
                time: 'Bắt đầu cuộc đánh giá',
                content:
                    'Họp khai mạc; xác nhận phạm vi, tiêu chí, phương pháp và kế hoạch đánh giá.',
                auditor: 'Đoàn đánh giá',
                auditee: 'Ban lãnh đạo/ Nhân sự liên quan',
            },
            {
                time: 'Theo lịch làm việc',
                content:
                    `${this.displayText(plan.audit_criteria)}\n${this.displayText(plan.audit_scope)}`,
                auditor: leaderName,
                auditee: 'Các bộ phận và quá trình thuộc phạm vi đánh giá',
            },
            {
                time: 'Cuối cuộc đánh giá',
                content:
                    'Đoàn đánh giá họp nội bộ, tổng hợp phát hiện và chuẩn bị kết luận đánh giá.',
                auditor: 'Đoàn đánh giá',
                auditee: '—',
            },
            {
                time: 'Kết thúc cuộc đánh giá',
                content:
                    'Họp kết thúc; trình bày kết quả, phát hiện và các hành động tiếp theo.',
                auditor: 'Đoàn đánh giá',
                auditee: 'Ban lãnh đạo/ Nhân sự liên quan',
            },
        ];
    }

    private normalizeScheduleRows(value: unknown, plan: any) {
        if (!Array.isArray(value) || value.length === 0) {
            return this.defaultSchedule(plan);
        }

        return value
            .slice(0, 100)
            .map((row) => {
                const item = this.isPlainObject(row) ? row : {};
                return {
                    time: this.displayText(item.time),
                    content: this.displayText(item.content),
                    auditor: this.displayText(item.auditor),
                    auditee: this.displayText(item.auditee),
                };
            });
    }

    private defaultAttendanceRows(plan: any) {
        const appointment = plan.audit_team_appointment;
        const application =
            plan.certification_projects?.certification_applications;
        const rows: Array<{
            full_name: string;
            department_title: string;
            opening_attended: boolean;
            closing_attended: boolean;
        }> = [];
        const seen = new Set<string>();

        const push = (
            fullName: unknown,
            departmentTitle: unknown,
            openingAttended = true,
            closingAttended = true,
        ) => {
            const name = this.displayText(fullName, '');
            if (!name) return;
            const key = this.normalize(name);
            if (seen.has(key)) return;
            seen.add(key);
            rows.push({
                full_name: name,
                department_title: this.displayText(
                    departmentTitle,
                    '—',
                ),
                opening_attended: openingAttended,
                closing_attended: closingAttended,
            });
        };

        for (const member of appointment?.members ?? []) {
            push(
                member.experts?.full_name,
                this.teamRoleLabel(member.team_role),
            );
        }

        push(
            application?.representative_name,
            application?.representative_position ??
            'Đại diện lãnh đạo/ Management representative',
        );
        push(
            application?.contact_name,
            application?.contact_position ??
            'Người liên hệ/ Contact person',
        );

        return rows;
    }

    private normalizeAttendanceRows(value: unknown, plan: any) {
        if (!Array.isArray(value) || value.length === 0) {
            return this.defaultAttendanceRows(plan);
        }

        return value
            .slice(0, 100)
            .map((row) => {
                const item = this.isPlainObject(row) ? row : {};
                return {
                    full_name: this.displayText(
                        item.full_name,
                        '',
                    ),
                    department_title: this.displayText(
                        item.department_title,
                        '',
                    ),
                    opening_attended:
                        item.opening_attended !== false,
                    closing_attended:
                        item.closing_attended !== false,
                };
            });
    }

    private attendanceTemplateRows(rows: Array<{
        full_name: string;
        department_title: string;
        opening_attended: boolean;
        closing_attended: boolean;
    }>) {
        return rows.map((row, index) => ({
            attendance: {
                no: index + 1,
                full_name: this.displayText(row.full_name),
                department_title: this.displayText(
                    row.department_title,
                ),
                opening_mark: row.opening_attended ? 'X' : '',
                closing_mark: row.closing_attended ? 'X' : '',
                signature: '',
            },
        }));
    }

    private attendanceTemplateSlots(rows: Array<{
        full_name: string;
        department_title: string;
        opening_attended: boolean;
        closing_attended: boolean;
    }>) {
        const blank = '\u200B';
        const slots: Record<string, string | number> = {};

        for (let index = 0; index < 9; index += 1) {
            const row = rows[index];
            const no = index + 1;
            slots[`attendance_${no}_no`] = no;
            slots[`attendance_${no}_full_name`] = row?.full_name || blank;
            slots[`attendance_${no}_department_title`] =
                row?.department_title || blank;
            slots[`attendance_${no}_opening_mark`] = row
                ? (row.opening_attended ? 'X' : blank)
                : blank;
            slots[`attendance_${no}_closing_mark`] = row
                ? (row.closing_attended ? 'X' : blank)
                : blank;
        }

        return slots;
    }

    private roleMarks(role: unknown): string {
        const normalized = this.normalize(role);
        return [
            `${['teamleader', 'leadauditor'].includes(normalized) ? '☑' : '☐'} Trưởng đoàn/ Team leader`,
            `${normalized === 'auditor' ? '☑' : '☐'} Chuyên gia đánh giá/ Auditor`,
            `${normalized === 'technicalexpert' ? '☑' : '☐'} Chuyên gia kỹ thuật/ Technical expert`,
            `${['observer', 'trainee', 'witnessevaluator'].includes(normalized) ? '☑' : '☐'} Khác/ Other`,
        ].join('\n');
    }

    private auditTypeMarks(value: unknown): string {
        const normalized = this.normalize(value);
        const stage1 = ['stage1', 'initialstage1'].includes(normalized);
        const stage2 = ['stage2', 'initialstage2'].includes(normalized);
        const surveillance = normalized.startsWith('surveillance');
        const recertification = normalized === 'recertification';
        return [
            `${stage1 ? '☑' : '☐'} Giai đoạn 1/ Stage 1`,
            `${stage2 ? '☑' : '☐'} Giai đoạn 2/ Stage 2`,
            `${surveillance ? '☑' : '☐'} Giám sát/ Surveillance`,
            `${recertification ? '☑' : '☐'} Tái chứng nhận/ Recertification`,
            `${!stage1 && !stage2 && !surveillance && !recertification ? '☑' : '☐'} Khác/ Other`,
        ].join('\n');
    }

    private auditLogExactFormMarks(
        role: unknown,
        standards: unknown,
        auditType: unknown,
    ) {
        const mark = (checked: boolean) => checked ? '☑' : '☐';
        const normalizedRole = this.normalize(role);
        const standardText = String(standards ?? '').toLowerCase();
        const normalizedAuditType = this.normalize(auditType);
        const isStage1 = ['stage1', 'initialstage1'].includes(
            normalizedAuditType,
        );
        const isStage2 = ['stage2', 'initialstage2'].includes(
            normalizedAuditType,
        );
        const isSurveillance = normalizedAuditType.startsWith(
            'surveillance',
        );
        const isRecertification = [
            'recertification',
            'renewal',
        ].includes(normalizedAuditType);
        const isTransfer = normalizedAuditType.includes('transfer');
        const isExpansion = normalizedAuditType.includes('expansion');

        return {
            role_team_leader_mark: mark([
                'teamleader',
                'leadauditor',
            ].includes(normalizedRole)),
            role_auditor_mark: mark(normalizedRole === 'auditor'),
            role_technical_expert_mark: mark(
                normalizedRole === 'technicalexpert',
            ),
            role_other_mark: mark(![
                'teamleader',
                'leadauditor',
                'auditor',
                'technicalexpert',
            ].includes(normalizedRole)),
            standard_iso9001_mark: mark(
                standardText.includes('iso 9001') ||
                standardText.includes('iso9001'),
            ),
            standard_iso14001_mark: mark(
                standardText.includes('iso 14001') ||
                standardText.includes('iso14001'),
            ),
            standard_iso45001_mark: mark(
                standardText.includes('iso 45001') ||
                standardText.includes('iso45001'),
            ),
            standard_iso22000_mark: mark(
                standardText.includes('iso 22000') ||
                standardText.includes('iso22000'),
            ),
            standard_haccp_mark: mark(standardText.includes('haccp')),
            standard_gmp_mark: mark(standardText.includes('gmp')),
            standard_other_mark: mark(![
                'iso 9001',
                'iso9001',
                'iso 14001',
                'iso14001',
                'iso 45001',
                'iso45001',
                'iso 22000',
                'iso22000',
                'haccp',
                'gmp',
            ].some((item) => standardText.includes(item))),
            audit_type_stage1_mark: mark(isStage1),
            audit_type_stage2_mark: mark(isStage2),
            audit_type_surveillance_mark: mark(isSurveillance),
            audit_type_recertification_mark: mark(isRecertification),
            audit_type_transfer_mark: mark(isTransfer),
            audit_type_expansion_mark: mark(isExpansion),
            audit_type_other_mark: mark(!isStage1 && !isStage2 &&
                !isSurveillance && !isRecertification &&
                !isTransfer && !isExpansion),
        };
    }

    private assignedPrograms(member: any, standardName: unknown): string {
        const programs = (member?.program_mandays ?? [])
            .filter((item: any) => Number(item.manday_units ?? 0) > 0)
            .map((item: any) =>
                this.displayText(
                    item.standard_code ?? item.management_system,
                    '',
                ),
            )
            .filter(Boolean);
        if (programs.length) {
            return Array.from(new Set(programs)).join(', ');
        }
        return this.displayText(standardName);
    }

    private commonSnapshot(plan: any) {
        const project = plan.certification_projects;
        const application = project.certification_applications;
        const customer = application.customers;
        const program = plan.audit_event?.audit_programs;
        const appointment = plan.audit_team_appointment;
        const documentData = this.planDocumentData(plan);
        const leader = this.teamLeader(appointment);
        const sites = application.sites ?? [];
        const issueDate = documentData.issue_date
            ? this.formatDate(String(documentData.issue_date))
            : this.formatDate(new Date());

        const countedMandays = (appointment?.members ?? [])
            .filter((member: any) =>
                COUNTED_MANDAY_ROLES.has(
                    this.normalize(member.team_role),
                ),
            )
            .reduce(
                (sum: number, member: any) =>
                    sum + this.decimalNumber(member.planned_mandays),
                0,
            );
        const requiredMandays = this.decimalNumber(
            plan.audit_event?.planned_mandays,
        );

        return {
            ...this.brandingSnapshot(),
            customer_code:
                program?.customer_code ?? customer.customer_code,
            organization_name_vi:
                program?.organization_name ?? customer.company_name,
            organization_name_en:
                application.company_name_en ?? customer.company_name,
            organization_address:
                application.headquarters_address ??
                program?.address ??
                customer.address,
            organization_address_vi:
                application.headquarters_address ??
                program?.address ??
                customer.address,
            organization_address_en:
                application.headquarters_address ??
                program?.address ??
                customer.address,
            representative_name: application.representative_name,
            representative_position: application.representative_position,
            representative_phone: application.representative_phone,
            representative_email: application.representative_email,
            contact_name:
                application.contact_name ??
                customer.contacts?.[0]?.full_name,
            contact_position:
                application.contact_position ??
                customer.contacts?.[0]?.position,
            contact_phone:
                application.contact_phone ??
                customer.contacts?.[0]?.phone ??
                customer.phone,
            contact_email:
                application.contact_email ??
                customer.contacts?.[0]?.email ??
                customer.email,
            effective_personnel:
                program?.effective_personnel ??
                application.employee_count ??
                application.total_employee_count,
            shift_1: application.shift1_count,
            shift_2: application.shift2_count,
            shift_3: application.shift3_count,
            certification_type_label: this.certificationTypeLabel(
                application.certification_type ??
                program?.certification_type,
            ),
            ...this.certificationTypeMarks(
                application.certification_type ??
                program?.certification_type,
            ),
            cycle_label: `Chu kỳ ${program?.cycle_number ?? 1}`,
            other_certification_type:
                application.other_certification_type,
            standard_list:
                program?.standard_name ??
                project.standard_name ??
                application.standard_name,
            standard_name:
                program?.standard_name ??
                project.standard_name ??
                application.standard_name,
            excluded_clauses: application.excluded_clauses,
            certification_scope:
                plan.audit_scope ??
                program?.certification_scope ??
                application.certification_scope,
            site_1:
                sites[0]?.address ??
                application.headquarters_address ??
                customer.address,
            site_2: sites[1]?.address,
            site_3: sites[2]?.address,
            audit_location:
                plan.location ??
                sites[0]?.address ??
                application.headquarters_address ??
                customer.address,
            audit_objectives: plan.audit_objectives,
            audit_criteria: plan.audit_criteria,
            audit_type_label: this.auditTypeLabel(
                plan.audit_type ?? plan.audit_event?.event_type,
            ),
            audit_dates: this.formatDateRange(
                plan.planned_start_date,
                plan.planned_end_date,
            ),
            audit_mandays: this.formatMandays(
                requiredMandays > 0
                    ? requiredMandays
                    : countedMandays,
            ),
            audit_language: this.displayText(
                documentData.audit_language,
                'Tiếng Việt',
            ),
            issue_date: issueDate,
            team: this.teamRows(appointment),
            team_leader_name: this.displayText(
                leader?.experts?.full_name,
            ),
            schedule: this.normalizeScheduleRows(
                documentData.schedule_rows,
                plan,
            ).map((row) => ({ schedule: row })),
            confirmation_text:
                `Phúc đáp kế hoạch đánh giá ngày ${issueDate} của ${this.brandingSnapshot().certification_body_name}, tổ chức được chứng nhận xác nhận và phản hồi các nội dung của kế hoạch đánh giá./ In response to the audit plan dated ${issueDate}, the certified organization confirms and comments on the audit plan contents.`,
        };
    }

    private programEventRows(program: any) {
        const events = program?.events ?? [];
        if (!events.length) {
            return [{
                event: {
                    no: 1,
                    type_dates_mandays: '—',
                    team: '—',
                    contents: '—',
                    findings: '—',
                    corrective_actions: '—',
                },
            }];
        }

        return events.map((event: any, index: number) => {
            const plan = event.audit_plans?.[0] ?? null;
            const appointment = plan?.audit_team_appointment;
            const reports = plan?.reports ?? [];
            const findings = reports.flatMap(
                (report: any) => report.audit_findings ?? [],
            );
            const team = (appointment?.members ?? [])
                .map((member: any) =>
                    `${this.displayText(member.experts?.full_name)} - ${this.teamRoleLabel(member.team_role)}`,
                )
                .join('\n') || '—';

            const actual = event.actual_start_date || event.actual_end_date;
            const dateText = actual
                ? this.formatDateRange(
                    event.actual_start_date,
                    event.actual_end_date,
                )
                : `Dự kiến tháng ${this.formatMonth(event.planned_start_date)}`;
            const mandays = event.actual_mandays ?? event.planned_mandays;

            const findingText = findings.length
                ? findings.map((finding: any) =>
                    `${this.displayText(finding.finding_code, '')} ${this.displayText(finding.description)}`.trim(),
                ).join('\n')
                : actual
                    ? 'Không ghi nhận phát hiện hoặc chưa cập nhật phát hiện.'
                    : 'Chưa thực hiện.';

            const unresolved = findings.filter((finding: any) =>
                !['closed', 'verified', 'accepted'].includes(
                    this.normalize(finding.status),
                ),
            );

            return {
                event: {
                    no: index + 1,
                    type_dates_mandays:
                        `${this.eventTypeLabel(event.event_type)}\n${dateText} - ${this.formatMandays(mandays)}`,
                    team,
                    contents:
                        plan
                            ? [
                                this.displayText(plan.audit_criteria, ''),
                                this.displayText(plan.audit_scope, ''),
                                this.displayText(plan.audit_objectives, ''),
                            ].filter(Boolean).join('\n') || '—'
                            : 'Chưa lập kế hoạch chi tiết.',
                    findings: findingText,
                    corrective_actions:
                        findings.length === 0
                            ? '—'
                            : unresolved.length === 0
                                ? 'Các điểm không phù hợp đã được đóng/xác nhận.'
                                : `Còn ${unresolved.length} phát hiện đang theo dõi.`,
                },
            };
        });
    }

    private checklistLibrariesForPlan(plan: any): ChecklistLibraryDefinition[] {
        const standardName = String(
            plan.audit_event?.audit_programs?.standard_name ??
            plan.certification_projects?.standard_name ??
            plan.certification_projects?.certification_applications?.standard_name ??
            '',
        ).toLowerCase().replace(/\s+/g, '');

        return CHECKLIST_LIBRARIES.filter((library) => {
            const token = library.program_key.toLowerCase().replace(/\s+/g, '');
            const family = token.split(':')[0];
            return standardName.includes(token) || standardName.includes(family);
        });
    }

    private checklistResult(value: unknown): ChecklistResult {
        const allowed = new Set<ChecklistResult>([
            'NOT_EVALUATED',
            'CONFORMITY',
            'OFI',
            'MINOR_NC',
            'MAJOR_NC',
        ]);
        const normalized = String(value ?? 'NOT_EVALUATED') as ChecklistResult;
        return allowed.has(normalized) ? normalized : 'NOT_EVALUATED';
    }

    private defaultChecklistAuditor(plan: any, library: ChecklistLibraryDefinition): string {
        const members = plan.audit_team_appointment?.members ?? [];
        const matched = members.filter((member: any) =>
            (member.program_mandays ?? []).some((item: any) => {
                const standard = this.normalize(item.standard_code);
                const managementSystem = this.normalize(item.management_system);
                return standard.includes(this.normalize(library.program_code)) ||
                    managementSystem === this.normalize(library.management_system);
            }),
        );
        const source = matched.length ? matched : [this.teamLeader(plan.audit_team_appointment)].filter(Boolean);
        return Array.from(new Set(source.map((member: any) =>
            this.displayText(member?.experts?.full_name, ''),
        ).filter(Boolean))).join(', ') || 'Đoàn đánh giá';
    }

    private normalizeChecklistPrograms(plan: any) {
        const documentData = this.planDocumentData(plan);
        const storedItems = Array.isArray(documentData.checklists)
            ? documentData.checklists
            : [];
        const storedMap = new Map<string, JsonObject>();
        for (const item of storedItems) {
            if (!this.isPlainObject(item)) continue;
            const key = String(item.program_key ?? '').trim();
            if (key) storedMap.set(key, item);
        }

        return this.checklistLibrariesForPlan(plan).map((library) => {
            const stored = storedMap.get(library.program_key) ?? {};
            const storedRows = Array.isArray(stored.rows) ? stored.rows : [];
            const rowMap = new Map<string, JsonObject>();
            for (const row of storedRows) {
                if (!this.isPlainObject(row)) continue;
                const rowId = String(row.row_id ?? '').trim();
                if (rowId) rowMap.set(rowId, row);
            }
            const rows = library.rows.map((base) => {
                const override = rowMap.get(base.row_id) ?? {};
                return {
                    row_id: base.row_id,
                    clause: this.displayText(override.clause, base.clause || ''),
                    content: this.displayText(override.content, base.content || ''),
                    is_section: base.is_section,
                    result: base.is_section
                        ? 'NOT_EVALUATED' as ChecklistResult
                        : this.checklistResult(override.result),
                    description: base.is_section
                        ? ''
                        : this.displayText(override.description, ''),
                };
            });
            return {
                program_key: library.program_key,
                program_code: library.program_code,
                management_system: library.management_system,
                source_label: library.source_label,
                auditor_name: this.displayText(
                    stored.auditor_name,
                    this.defaultChecklistAuditor(plan, library),
                ),
                rows,
                template_file: library.template_file,
            };
        });
    }

    private checklistTemplateSlots(rows: Array<{
        clause: string;
        content: string;
        is_section: boolean;
        result: ChecklistResult;
        description: string;
    }>) {
        const slots: Record<string, string> = {};
        rows.forEach((row, index) => {
            const key = String(index + 1).padStart(3, '0');
            slots[`row_${key}_clause`] = row.clause || '';
            slots[`row_${key}_content`] = row.content || '';
            slots[`row_${key}_c`] = row.result === 'CONFORMITY' ? 'X' : '';
            slots[`row_${key}_ofi`] = row.result === 'OFI' ? 'X' : '';
            slots[`row_${key}_minor`] = row.result === 'MINOR_NC' ? 'X' : '';
            slots[`row_${key}_major`] = row.result === 'MAJOR_NC' ? 'X' : '';
            slots[`row_${key}_description`] = row.description || '';
        });
        return slots;
    }

    private buildChecklistDocuments(plan: any) {
        const common = this.commonSnapshot(plan);
        return this.normalizeChecklistPrograms(plan).map((checklist) => {
            const snapshot = {
                ...common,
                checklist_standard_code: checklist.program_code,
                audit_date: this.formatDateRange(
                    plan.planned_start_date,
                    plan.planned_end_date,
                ),
                auditor_name: checklist.auditor_name,
                prepared_by: checklist.auditor_name,
                ...this.checklistTemplateSlots(checklist.rows),
            };
            const missingFields = this.collectMissing([
                ['Tên tổ chức', common.organization_name_vi],
                ['Ngày đánh giá', plan.planned_start_date],
                ['Chuyên gia đánh giá', checklist.auditor_name],
                ['Tiêu chuẩn', checklist.program_code],
                ['Nội dung bảng kiểm', checklist.rows.length],
            ]);
            return {
                definition: {
                    requestType: 'audit_checklist_f06',
                    formCode: 'F.06-P.09',
                    label: `Bảng kiểm đánh giá - ${checklist.program_code}`,
                    templateFile: checklist.template_file,
                    entityType: 'audit_plan',
                    entityId: plan.id,
                    documentType: `audit_checklist_f06_${checklist.management_system.toLowerCase()}`,
                    programKey: checklist.program_key,
                    fileNameSuffix: checklist.program_code,
                } satisfies AuditDocumentDefinition,
                snapshot,
                missingFields,
            };
        });
    }

    private async buildProgramDocument(plan: any, program: any) {
        if (!program) {
            throw new BadRequestException(
                'Kế hoạch chưa thuộc chương trình đánh giá để sinh F.03-P.09',
            );
        }

        const common = this.commonSnapshot(plan);
        const programFormData = this.parseJson(program.form_data);
        const snapshot = {
            ...common,
            factor_1_status: this.displayText(
                this.nested(programFormData, 'update_factors', 'complaints'),
                '☑ Không/ No',
            ),
            factor_2_status: this.displayText(
                this.nested(programFormData, 'update_factors', 'requirements'),
                '☑ Không/ No',
            ),
            factor_3_status: this.displayText(
                this.nested(programFormData, 'update_factors', 'scope_or_size'),
                '☑ Không/ No',
            ),
            factor_4_status: this.displayText(
                this.nested(programFormData, 'update_factors', 'integrated_audit'),
                '☑ Có/ Yes',
            ),
            events: this.programEventRows(program),
            prepared_date: this.formatDate(program.prepared_at),
            prepared_by: this.displayText(
                program.preparer?.full_name ??
                program.preparer?.username,
            ),
        };

        const missingFields = this.collectMissing([
            ['Tên tổ chức', snapshot.organization_name_vi],
            ['Tiêu chuẩn', snapshot.standard_name],
            ['Phạm vi chứng nhận', snapshot.certification_scope],
            ['Các kỳ đánh giá', program.events?.length],
        ]);

        return {
            definition: {
                requestType: 'audit_program_f03',
                formCode: 'F.03-P.09',
                label: 'Chương trình đánh giá',
                templateFile: 'F.03-P.09.audit-program.template.docx',
                entityType: 'audit_program',
                entityId: program.id,
                documentType: 'audit_program_f03',
            } satisfies AuditDocumentDefinition,
            snapshot,
            missingFields,
        };
    }

    private buildAppointmentDocument(
        plan: any,
        appointment: any,
    ) {
        if (!appointment) {
            throw new BadRequestException(
                'Hồ sơ chưa có quyết định chỉ định đoàn cấp hồ sơ để sinh F.04-P.09',
            );
        }

        const common = this.commonSnapshot(plan);
        const project = plan.certification_projects;
        const application = project.certification_applications;
        const projectStandard =
            project.standard_name ??
            application.standard_name ??
            common.standard_name;
        const projectScope =
            application.certification_scope ??
            common.certification_scope;
        const projectLocation =
            application.headquarters_address ??
            common.audit_location;
        const signerName = this.displayText(
            appointment.approved_by_user?.full_name ??
            appointment.approved_by_user?.username,
            '',
        );
        const article = [
            `Điều 1/ Article 1. Chỉ định đoàn đánh giá hệ thống quản lý phù hợp ${projectStandard} cho ${common.organization_name_vi} tại ${projectLocation}, phạm vi ${projectScope}, gồm các ông/bà có tên dưới đây.`,
            `Assignment of an audit team to audit the management system in accordance with ${projectStandard} for ${common.organization_name_en} at ${projectLocation}, scope ${projectScope}, including the following persons.`,
        ].join('\n');

        const snapshot = {
            ...common,
            standard_name: projectStandard,
            certification_scope: projectScope,
            audit_location: projectLocation,
            team: this.teamRows(appointment),
            appointment_number: appointment.appointment_number,
            appointment_date: this.formatDate(
                appointment.appointment_date,
            ),
            assignment_article: article,
            signer_title_vi:
                process.env.CERTIFICATION_BODY_SIGNER_TITLE_VI ??
                'NGƯỜI CÓ THẨM QUYỀN',
            signer_title_en:
                process.env.CERTIFICATION_BODY_SIGNER_TITLE_EN ??
                'Authorised Signatory',
            signer_name: signerName,
        };

        const missingFields = this.collectMissing([
            ['Số chỉ định đoàn', appointment.appointment_number],
            ['Ngày chỉ định', appointment.appointment_date],
            ['Tên tổ chức', common.organization_name_vi],
            ['Tiêu chuẩn', projectStandard],
            ['Địa điểm đánh giá', projectLocation],
            ['Phạm vi chứng nhận', projectScope],
            ['Thành viên đoàn', appointment.members?.length],
        ]);

        if (this.normalize(appointment.status) !== 'issued') {
            missingFields.push(
                'Chỉ định đoàn chưa ở trạng thái đã ban hành; tài liệu sinh ra là bản dự thảo.',
            );
        }

        return {
            definition: {
                requestType: 'audit_team_assignment_f04',
                formCode: 'F.04-P.09',
                label: 'Chỉ định đoàn đánh giá',
                templateFile: 'F.04-P.09.audit-team-assignment.template.docx',
                entityType: 'audit_team_appointment',
                entityId: appointment.id,
                documentType: 'audit_team_assignment_f04',
            } satisfies AuditDocumentDefinition,
            snapshot,
            missingFields,
        };
    }

    private buildPlanDocument(plan: any) {
        const common = this.commonSnapshot(plan);
        const auditType = plan.audit_type ??
            plan.audit_event?.event_type;
        const stage1 = ['stage1', 'initialstage1'].includes(
            this.normalize(auditType),
        );
        const snapshot = {
            ...common,
            plan_title: this.auditPlanTitle(auditType),
        };

        const missingFields = this.collectMissing([
            ['Mã kế hoạch', plan.plan_code],
            ['Ngày bắt đầu', plan.planned_start_date],
            ['Ngày kết thúc', plan.planned_end_date],
            ['Địa điểm đánh giá', common.audit_location],
            ['Phạm vi đánh giá', common.certification_scope],
            ['Tiêu chí đánh giá', common.audit_criteria],
            ['Mục tiêu đánh giá', common.audit_objectives],
            ['Đoàn đánh giá', plan.audit_team_appointment?.members?.length],
        ]);

        return {
            definition: {
                requestType: 'audit_plan_f05',
                formCode: 'F.05-P.09',
                label: stage1
                    ? 'Kế hoạch đánh giá Giai đoạn 1'
                    : 'Kế hoạch đánh giá',
                templateFile: stage1
                    ? 'F.05-P.09.audit-plan-stage1.template.docx'
                    : 'F.05-P.09.audit-plan-stage2.template.docx',
                entityType: 'audit_plan',
                entityId: plan.id,
                documentType: stage1
                    ? 'audit_plan_stage1_f05'
                    : 'audit_plan_f05',
            } satisfies AuditDocumentDefinition,
            snapshot,
            missingFields,
        };
    }


    private buildAttendanceDocument(plan: any) {
        const common = this.commonSnapshot(plan);
        const documentData = this.planDocumentData(plan);
        const attendanceRows = this.normalizeAttendanceRows(
            documentData.attendance_rows,
            plan,
        );
        const snapshot = {
            ...common,
            opening_date: this.formatDate(
                documentData.opening_date ??
                plan.planned_start_date,
            ),
            opening_time: this.displayText(
                documentData.opening_time,
                '—',
            ),
            closing_date: this.formatDate(
                documentData.closing_date ??
                plan.planned_end_date,
            ),
            closing_time: this.displayText(
                documentData.closing_time,
                '—',
            ),
            attendance: this.attendanceTemplateRows(
                attendanceRows,
            ),
            ...this.attendanceTemplateSlots(attendanceRows),
            auditee_representative_name: this.displayText(
                common.representative_name ?? common.contact_name,
            ),
            prepared_by: this.displayText(
                this.teamLeader(plan.audit_team_appointment)
                    ?.experts?.full_name,
            ),
        };

        const missingFields = this.collectMissing([
            ['Tên tổ chức', common.organization_name_vi],
            ['Địa điểm', common.audit_location],
            ['Ngày họp khai mạc', snapshot.opening_date],
            ['Ngày họp kết thúc', snapshot.closing_date],
            ['Danh sách tham dự', attendanceRows.length],
        ]);
        if (attendanceRows.length > 9) {
            missingFields.push(
                'Mẫu F.07 gốc có tối đa 9 người trên một trang; hãy rút gọn danh sách hoặc tách phụ lục trước khi xuất.',
            );
        }

        return {
            definition: {
                requestType: 'audit_attendance_f07',
                formCode: 'F.07-P.09',
                label: 'Danh sách tham dự khai mạc/kết thúc',
                templateFile: 'F.07-P.09.attendance-record.template.docx',
                entityType: 'audit_plan',
                entityId: plan.id,
                documentType: 'audit_attendance_f07',
            } satisfies AuditDocumentDefinition,
            snapshot,
            missingFields,
        };
    }

    private buildAuditLogDocuments(plan: any) {
        const common = this.commonSnapshot(plan);
        const appointment = plan.audit_team_appointment;
        return (appointment?.members ?? []).map((member: any) => {
            const expertName = this.displayText(
                member.experts?.full_name,
            );
            const expertCode = this.displayText(
                member.experts?.employee_code,
            );
            const actualMandays =
                member.actual_mandays ?? member.planned_mandays;
            const start =
                member.actual_start_date ?? member.planned_start_date;
            const end =
                member.actual_end_date ?? member.planned_end_date;
            const snapshot = {
                ...common,
                auditor_name: expertName,
                auditor_code: expertCode,
                audit_dates: this.formatDateRange(start, end),
                auditor_mandays: this.formatMandays(actualMandays),
                certification_scope: this.displayText(
                    common.certification_scope,
                ).replace(/[.。]+$/g, ''),
                role_marks: this.roleMarks(member.team_role),
                audit_type_marks: this.auditTypeMarks(
                    plan.audit_type ?? plan.audit_event?.event_type,
                ),
                assigned_programs: this.assignedPrograms(
                    member,
                    common.standard_name,
                ),
                contact_phone: this.displayText(
                    common.contact_phone ?? common.representative_phone,
                    '',
                ),
                contact_email: this.displayText(
                    common.contact_email ?? common.representative_email,
                    '',
                ),
                ...this.auditLogExactFormMarks(
                    member.team_role,
                    common.standard_name,
                    plan.audit_type ?? plan.audit_event?.event_type,
                ),
                signer_name:
                    process.env.CERTIFICATION_BODY_SIGNER_NAME ?? '—',
            };
            const missingFields = this.collectMissing([
                ['Tên chuyên gia', expertName],
                ['Mã chuyên gia', expertCode],
                ['Ngày đánh giá', start],
                ['Ngày công', this.decimalNumber(actualMandays)],
                ['Tên tổ chức', common.organization_name_vi],
                ['Phạm vi đánh giá', common.certification_scope],
                ['Tiêu chuẩn', common.standard_name],
            ]);
            return {
                definition: {
                    requestType: 'audit_log_f15',
                    formCode: 'F.15-P.09',
                    label: `Audit log - ${expertName}`,
                    templateFile: 'F.15-P.09.audit-log.template.docx',
                    entityType: 'audit_team_member',
                    entityId: member.id,
                    documentType: 'audit_log_f15',
                    memberId: member.id,
                    fileNameSuffix: expertCode,
                } satisfies AuditDocumentDefinition,
                snapshot,
                missingFields,
            };
        });
    }

    private async buildCorrectiveActionDocuments(plan: any) {
        const findings = await this.prisma.audit_findings.findMany({
            where: {
                reports: {
                    audit_plan_id: plan.id,
                },
                finding_type: {
                    in: ['minor_nc', 'major_nc'],
                },
            },
            include: {
                corrective_actions: {
                    orderBy: {
                        version_no: 'desc',
                    },
                },
            },
            orderBy: [
                { detected_date: 'asc' },
                { finding_code: 'asc' },
            ],
        });

        if (!findings.length) {
            return [];
        }

        const latestActions = findings
            .map((finding) => finding.corrective_actions[0] ?? null)
            .filter(Boolean) as any[];
        const actionIds = latestActions.map((action) => action.id);
        const reviewerIds = Array.from(new Set(
            latestActions.map((action) => action.reviewed_by).filter(Boolean),
        )) as string[];

        const [evidenceFiles, reviewers] = await Promise.all([
            actionIds.length
                ? this.prisma.documentFile.findMany({
                    where: {
                        entity_type: 'corrective_action',
                        entity_id: { in: actionIds },
                        document_type: 'corrective_action_evidence',
                        is_current: true,
                    },
                    orderBy: {
                        created_at: 'asc',
                    },
                })
                : Promise.resolve([]),
            reviewerIds.length
                ? this.prisma.users.findMany({
                    where: { id: { in: reviewerIds } },
                    select: {
                        id: true,
                        full_name: true,
                        username: true,
                    },
                })
                : Promise.resolve([]),
        ]);

        const evidenceByAction = new Map<string, any[]>();
        for (const file of evidenceFiles) {
            const current = evidenceByAction.get(file.entity_id) ?? [];
            current.push(file);
            evidenceByAction.set(file.entity_id, current);
        }
        const reviewerById = new Map<
            string,
            {
                id: string;
                full_name: string | null;
                username: string;
            }
        >(
            reviewers.map((reviewer) => [
                reviewer.id,
                reviewer,
            ] as const),
        );
        const common = this.commonSnapshot(plan);

        return findings.map((finding) => {
            const action = finding.corrective_actions[0] ?? null;
            const evidence = action
                ? evidenceByAction.get(action.id) ?? []
                : [];
            const reviewer = action?.reviewed_by
                ? reviewerById.get(action.reviewed_by) ?? null
                : null;
            const accepted = ['accepted', 'closed', 'actionaccepted'].includes(
                this.normalize(action?.status ?? finding.status),
            );
            const rejected = this.normalize(action?.status) === 'revisionrequired';
            const grade = this.normalize(finding.finding_type) === 'majornc'
                ? 'NC nặng / Major NC'
                : 'NC nhẹ / Minor NC';

            const snapshot = {
                ...common,
                finding_code: this.displayText(finding.finding_code),
                finding_grade: grade,
                finding_description: this.displayText(finding.description),
                finding_clause: this.displayText(finding.clause),
                finding_requirement: this.displayText(finding.requirement),
                finding_evidence: this.displayText(finding.objective_evidence),
                root_cause: this.displayText(action?.root_cause),
                correction: this.displayText(action?.correction),
                corrective_action_plan: this.displayText(
                    action?.corrective_action_plan,
                ),
                evidence_summary: evidence.length
                    ? evidence.map((file, index) =>
                        `${index + 1}. ${this.displayText(file.original_name)}`,
                    ).join('\n')
                    : '—',
                completion_date: this.formatDate(
                    action?.target_date ?? action?.submitted_at,
                ),
                responsible_person: this.displayText(
                    action?.responsible_person,
                ),
                accepted_mark: accepted ? 'X' : '',
                not_accepted_mark: rejected ? 'X' : '',
                review_comment: this.displayText(action?.review_comment),
                checked_date: this.formatDate(action?.reviewed_at),
                reviewer_name: this.displayText(
                    reviewer?.full_name ?? reviewer?.username,
                ),
            };

            return {
                definition: {
                    requestType: 'corrective_action_request_f10',
                    formCode: 'F.10-P.09',
                    label: `Phiếu yêu cầu hành động khắc phục - ${this.displayText(finding.finding_code)}`,
                    templateFile: 'F.10-P.09.corrective-action-request.template.docx',
                    entityType: 'audit_finding',
                    entityId: finding.id,
                    documentType: 'corrective_action_request_f10',
                    findingId: finding.id,
                    fileNameSuffix: finding.finding_code,
                } satisfies AuditDocumentDefinition,
                snapshot,
                missingFields: action
                    ? this.collectMissing([
                        ['Nguyên nhân gốc rễ', action.root_cause],
                        ['Hành động sửa chữa', action.correction],
                        ['Kế hoạch hành động khắc phục', action.corrective_action_plan],
                        ['Bằng chứng khắc phục', evidence.length ? 'yes' : ''],
                    ])
                    : ['Khách hàng chưa gửi phản hồi hành động khắc phục'],
            };
        });
    }


    private async buildTechnicalReviewDocument(
        plan: any,
    ) {
        const report =
            await this.prisma.reports.findFirst({
                where: {
                    audit_plan_id:
                        plan.id,
                },
                orderBy: [
                    {
                        version_no: 'desc',
                    },
                    {
                        created_at: 'desc',
                    },
                ],
                include: {
                    technical_reviews: {
                        orderBy: {
                            created_at: 'desc',
                        },
                        include: {
                            reviewer: {
                                select: {
                                    id: true,
                                    username: true,
                                    full_name: true,
                                    email: true,
                                },
                            },
                        },
                    },
                },
            });

        const review =
            report?.technical_reviews?.[0] ??
            null;

        if (!review) {
            return null;
        }

        const formData =
            this.parseJson(
                review.form_data,
            );

        const f11 =
            this.isPlainObject(
                formData.f11,
            )
                ? formData.f11 as JsonObject
                : {};

        const preliminary = Array.isArray(
            f11.preliminary_criteria,
        )
            ? f11.preliminary_criteria
            : [];

        const technical = Array.isArray(
            f11.technical_criteria,
        )
            ? f11.technical_criteria
            : [];

        const resultAt = (
            items: unknown[],
            index: number,
        ) => {
            const item =
                items[index];

            if (
                !item ||
                typeof item !==
                'object' ||
                Array.isArray(item)
            ) {
                return 'pending';
            }

            return String(
                (item as Record<string, unknown>)
                    .result ??
                'pending',
            )
                .trim()
                .toLowerCase();
        };

        const mark = (
            result: string,
            expected: 'yes' | 'no',
        ) => {
            if (
                result ===
                'not_applicable'
            ) {
                return expected === 'yes'
                    ? 'N/A'
                    : '\u200B';
            }

            return result === expected
                ? 'X'
                : '\u200B';
        };

        const marks: Record<string, string> =
            {};

        for (
            let index = 0;
            index < 19;
            index += 1
        ) {
            const result =
                resultAt(
                    preliminary,
                    index,
                );
            marks[
                `preliminary_${index + 1}_yes_mark`
            ] = mark(result, 'yes');
            marks[
                `preliminary_${index + 1}_no_mark`
            ] = mark(result, 'no');
        }

        for (
            let index = 0;
            index < 4;
            index += 1
        ) {
            const result =
                resultAt(
                    technical,
                    index,
                );
            marks[
                `technical_${index + 1}_yes_mark`
            ] = mark(result, 'yes');
            marks[
                `technical_${index + 1}_no_mark`
            ] = mark(result, 'no');
        }

        const common =
            this.commonSnapshot(plan);

        const reviewerName =
            this.displayText(
                review.reviewer
                    ?.full_name ??
                review.reviewer
                    ?.username,
            );

        const recommendation =
            String(
                f11.recommendation ??
                '',
            )
                .trim()
                .toLowerCase();

        const snapshot = {
            ...common,
            ...marks,
            review_date:
                this.formatDate(
                    String(
                        f11.review_date ??
                        review.completed_at ??
                        new Date(),
                    ),
                ),
            audit_language:
                this.displayText(
                    f11.audit_language ??
                    common.audit_language,
                    'Tiếng Việt',
                ),
            preliminary_other_comment:
                this.displayText(
                    f11.preliminary_other_comment,
                    'Không có.',
                ),
            technical_other_comment:
                this.displayText(
                    f11.technical_other_comment,
                    'Không có.',
                ),
            recommendation_issue_mark:
                recommendation ===
                    'certification_recommended'
                    ? 'X'
                    : '\u200B',
            recommendation_not_issue_mark:
                recommendation ===
                    'certification_not_recommended'
                    ? 'X'
                    : '\u200B',
            recommendation_comment:
                this.displayText(
                    f11.recommendation_comment ??
                    f11.conditions,
                ),
            preliminary_reviewer_name:
                reviewerName,
            technical_reviewer_name:
                reviewerName,
            recommendation_reviewer_name:
                reviewerName,
        };

        const unanswered =
            [
                ...preliminary,
                ...technical,
            ].filter((item) =>
                !item ||
                typeof item !== 'object' ||
                Array.isArray(item) ||
                String(
                    (
                        item as Record<
                            string,
                            unknown
                        >
                    ).result ??
                    'pending',
                )
                    .trim()
                    .toLowerCase() ===
                'pending',
            ).length;

        const missingFields =
            this.collectMissing([
                [
                    'Ngày thẩm xét',
                    f11.review_date,
                ],
                [
                    'Người thẩm xét',
                    reviewerName,
                ],
                [
                    'Kiến nghị chứng nhận',
                    f11.recommendation,
                ],
            ]);

        if (unanswered > 0) {
            missingFields.push(
                `Còn ${unanswered} tiêu chí F.11 chưa kết luận`,
            );
        }

        if (
            this.normalize(
                review.status,
            ) !== 'completed'
        ) {
            missingFields.push(
                'Thẩm xét chưa hoàn thành; tài liệu sinh ra là bản dự thảo.',
            );
        }

        return {
            definition: {
                requestType:
                    'technical_review_report_f11',
                formCode:
                    'F.11-P.09',
                label:
                    'Báo cáo thẩm xét kỹ thuật',
                templateFile:
                    'F.11-P.09.technical-review.template.docx',
                entityType:
                    'technical_review',
                entityId:
                    review.id,
                documentType:
                    'technical_review_report_f11',
                fileNameSuffix:
                    report?.report_code ??
                    'F11',
            } satisfies AuditDocumentDefinition,
            snapshot,
            missingFields,
        };
    }

    private async buildMonitoringDocument(plan: any) {
        const common = this.commonSnapshot(plan);
        const projectId = plan.project_id;
        const application =
            plan.certification_projects.certification_applications;
        const projectAppointment = this.projectTeamAppointment(plan);
        const projectPlans = await this.prisma.audit_plans.findMany({
            where: { project_id: projectId },
            include: {
                audit_event: true,
                reports: {
                    include: {
                        audit_findings: {
                            include: {
                                corrective_actions: true,
                            },
                        },
                        technical_reviews: {
                            include: {
                                certification_decision: true,
                                audit_result_notification: true,
                                certificates: true,
                            },
                        },
                    },
                },
            },
        });
        const applicationReviews =
            await this.prisma.application_reviews.findMany({
                where: { application_id: application.id },
            });

        const classify = (candidate: any) =>
            this.normalize(
                candidate.audit_type ??
                candidate.audit_event?.event_type,
            );
        const stage1Plans = projectPlans.filter((item) =>
            ['stage1', 'initialstage1'].includes(classify(item)),
        );
        const stage2Plans = projectPlans.filter((item) =>
            ['stage2', 'initialstage2'].includes(classify(item)),
        );
        const allReports = projectPlans.flatMap((item) =>
            item.reports ?? [],
        );
        const findings = allReports.flatMap((item: any) =>
            item.audit_findings ?? [],
        );
        const reviews = allReports.flatMap((item: any) =>
            item.technical_reviews ?? [],
        );
        const decisions = reviews
            .map((item: any) => item.certification_decision)
            .filter(Boolean);
        const notifications = reviews
            .map((item: any) => item.audit_result_notification)
            .filter(Boolean);
        const certificates = reviews
            .map((item: any) => item.certificates)
            .filter(Boolean);

        const hasGenerated = async (
            entityType: string,
            entityId: string | null | undefined,
            documentType: string,
        ) => {
            if (!entityId) return false;
            const history =
                await this.documentFilesService.findByEntity(
                    entityType,
                    entityId,
                    documentType,
                );
            return history.length > 0;
        };
        const anyPlanDocument = async (documentType: string) => {
            for (const projectPlan of projectPlans) {
                if (await hasGenerated(
                    'audit_plan',
                    projectPlan.id,
                    documentType,
                )) return true;
            }
            return false;
        };

        const hasChecklistDocument = async () => {
            for (const type of [
                'audit_checklist_f06_qms',
                'audit_checklist_f06_ems',
                'audit_checklist_f06_ohsms',
            ]) {
                if (await anyPlanDocument(type)) return true;
            }
            return false;
        };

        const program = plan.audit_event?.audit_programs;
        const checks = [
            {
                key: 'application',
                content: 'Phiếu đăng ký chứng nhận/ Certification registration form',
                completed: Boolean(application.id),
                note: 'Dữ liệu hệ thống',
            },
            {
                key: 'application_review',
                content: 'Xem xét đăng ký chứng nhận/ Review applying for certification',
                completed: applicationReviews.length > 0,
                note: applicationReviews.length
                    ? `${applicationReviews.length} lần xem xét`
                    : 'Chưa có phiếu xem xét',
            },
            {
                key: 'business_license',
                content: 'Giấy phép đăng ký kinh doanh/ Business Registration Certificate',
                completed: Boolean(application.associated_documents),
                note: application.associated_documents
                    ? 'Đã khai báo tài liệu liên quan'
                    : 'Cần kiểm tra tệp đính kèm',
            },
            {
                key: 'team_assignment',
                content: 'Chỉ định đoàn đánh giá/ Audit team assignment letter',
                completed: this.normalize(projectAppointment?.status) === 'issued',
                note: projectAppointment?.appointment_number ?? 'Chưa ban hành',
            },
            {
                key: 'audit_program',
                content: 'Chương trình đánh giá/ Audit program',
                completed: Boolean(program?.id),
                note: program?.program_code ?? 'Chưa có chương trình',
            },
            {
                key: 'stage1_plan',
                content: 'Kế hoạch đánh giá Giai đoạn 1/ Stage 1 audit plan',
                completed: stage1Plans.length > 0,
                note: stage1Plans[0]?.plan_code ?? 'Không áp dụng/chưa lập',
            },
            {
                key: 'stage1_report',
                content: 'Báo cáo đánh giá Giai đoạn 1/ Stage 1 audit report',
                completed: stage1Plans.some((item) => item.reports.length > 0),
                note: stage1Plans.some((item) => item.reports.length > 0)
                    ? 'Đã có báo cáo'
                    : 'Chưa có báo cáo',
            },
            {
                key: 'stage2_plan',
                content: 'Kế hoạch đánh giá Giai đoạn 2/ Stage 2 audit plan',
                completed: stage2Plans.length > 0,
                note: stage2Plans[0]?.plan_code ?? 'Chưa lập',
            },
            {
                key: 'checklist',
                content: 'Bảng kiểm đánh giá/ Checklist',
                completed: await hasChecklistDocument(),
                note: 'Tài liệu điện tử',
            },
            {
                key: 'attendance',
                content: 'Danh sách họp khai mạc/kết thúc/ Opening and closing meeting list',
                completed: await anyPlanDocument('audit_attendance_f07'),
                note: 'F.07-P.09',
            },
            {
                key: 'stage2_report',
                content: 'Báo cáo đánh giá Giai đoạn 2/ Stage 2 audit report',
                completed: stage2Plans.some((item) => item.reports.length > 0),
                note: stage2Plans.some((item) => item.reports.length > 0)
                    ? 'Đã có báo cáo'
                    : 'Chưa có báo cáo',
            },
            {
                key: 'cars',
                content: 'Phiếu yêu cầu hành động khắc phục/ Corrective action requests',
                completed: findings.some((finding: any) =>
                    ['minor', 'major', 'minornc', 'majornc'].includes(
                        this.normalize(finding.finding_type),
                    ),
                ),
                note: findings.length
                    ? `${findings.length} phát hiện`
                    : 'Không có/chưa ghi nhận',
            },
            {
                key: 'technical_review',
                content: 'Báo cáo thẩm xét/ Technical review report',
                completed: reviews.length > 0,
                note: reviews.length
                    ? this.displayText(reviews[0].status)
                    : 'Chưa thẩm xét',
            },
            {
                key: 'notification',
                content: 'Thông báo kết quả đánh giá/ Audit result notification',
                completed: notifications.length > 0,
                note: notifications[0]?.notification_number ?? 'Chưa ban hành',
            },
            {
                key: 'decision',
                content: 'Quyết định chứng nhận/ Certification decision',
                completed: decisions.length > 0,
                note: decisions[0]?.decision_number ?? 'Chưa ban hành',
            },
            {
                key: 'certificate',
                content: 'Giấy chứng nhận/ Certificate',
                completed: certificates.length > 0,
                note: certificates[0]?.cert_number ?? 'Chưa cấp',
            },
        ];
        const monitoringSlots: Record<string, string> = {};
        const blank = '\u200B';
        for (let index = 0; index < 17; index += 1) {
            const item = checks[index];
            const no = index + 1;
            monitoringSlots[`monitoring_${no}_yes_mark`] = item
                ? (item.completed ? 'X' : blank)
                : blank;
            monitoringSlots[`monitoring_${no}_no_mark`] = item
                ? (item.completed ? blank : 'X')
                : blank;
        }

        const snapshot = {
            ...common,
            ...monitoringSlots,
            monitoring: checks.map((item, index) => ({
                monitoring: {
                    no: index + 1,
                    content: item.content,
                    yes_mark: item.completed ? 'X' : '',
                    no_mark: item.completed ? '' : 'X',
                    note: item.note,
                },
            })),
            prepared_by: this.displayText(
                this.teamLeader(plan.audit_team_appointment)
                    ?.experts?.full_name,
            ),
        };

        return {
            definition: {
                requestType: 'audit_monitoring_f17',
                formCode: 'F.17-P.09',
                label: 'Phiếu theo dõi quá trình đánh giá',
                templateFile: 'F.17-P.09.audit-monitoring.template.docx',
                entityType: 'certification_project',
                entityId: projectId,
                documentType: 'audit_monitoring_f17',
            } satisfies AuditDocumentDefinition,
            snapshot,
            missingFields: this.collectMissing([
                ['Tên khách hàng', common.organization_name_vi],
                ['Mã khách hàng', common.customer_code],
                ['Tiêu chuẩn', common.standard_name],
                ['Phạm vi chứng nhận', common.certification_scope],
            ]),
        };
    }

    private collectMissing(
        fields: Array<[string, unknown]>,
    ): string[] {
        return fields
            .filter(([, value]) => {
                if (typeof value === 'number') {
                    return value <= 0;
                }
                return !value || String(value).trim() === '';
            })
            .map(([label]) => label);
    }

    private async buildAll(planId: string) {
        const plan = await this.loadPlan(planId);
        const program = await this.loadProgram(
            plan.audit_event?.audit_programs?.id,
        );

        const documents: Array<{
            definition: AuditDocumentDefinition;
            snapshot: Record<string, unknown>;
            missingFields: string[];
        }> = [];

        if (program) {
            documents.push(
                await this.buildProgramDocument(plan, program),
            );
        }

        const projectAppointment =
            this.projectTeamAppointment(plan);
        if (projectAppointment) {
            documents.push(
                this.buildAppointmentDocument(
                    plan,
                    projectAppointment,
                ),
            );
        }

        documents.push(this.buildPlanDocument(plan));
        documents.push(this.buildAttendanceDocument(plan));
        documents.push(...this.buildAuditLogDocuments(plan));
        documents.push(...this.buildChecklistDocuments(plan));
        documents.push(...await this.buildCorrectiveActionDocuments(plan));

        const technicalReviewDocument =
            await this.buildTechnicalReviewDocument(
                plan,
            );
        if (technicalReviewDocument) {
            documents.push(
                technicalReviewDocument,
            );
        }

        documents.push(await this.buildMonitoringDocument(plan));

        return {
            plan,
            program,
            documents,
        };
    }

    async preview(planId: string) {
        const built = await this.buildAll(planId);
        const documentData = this.planDocumentData(built.plan);
        const scheduleRows = this.normalizeScheduleRows(
            documentData.schedule_rows,
            built.plan,
        );

        const documentCards = await Promise.all(
            built.documents.map(async (document) => {
                const history =
                    await this.documentFilesService.findByEntity(
                        document.definition.entityType,
                        document.definition.entityId,
                        document.definition.documentType,
                    );

                return {
                    document_type: document.definition.requestType,
                    stored_document_type:
                        document.definition.documentType,
                    form_code: document.definition.formCode,
                    label: document.definition.label,
                    entity_type: document.definition.entityType,
                    entity_id: document.definition.entityId,
                    member_id: document.definition.memberId ?? null,
                    program_key: document.definition.programKey ?? null,
                    finding_id: document.definition.findingId ?? null,
                    card_key: [
                        document.definition.requestType,
                        document.definition.memberId ?? '',
                        document.definition.programKey ?? '',
                        document.definition.findingId ?? '',
                    ].join(':'),
                    missing_fields: document.missingFields,
                    can_generate: true,
                    history,
                };
            }),
        );

        const availableTypes = new Set(
            documentCards.map((item) => item.document_type),
        );

        if (!availableTypes.has('audit_program_f03')) {
            documentCards.unshift({
                document_type: 'audit_program_f03',
                stored_document_type: 'audit_program_f03',
                form_code: 'F.03-P.09',
                label: 'Chương trình đánh giá',
                entity_type: 'audit_program',
                entity_id: '',
                member_id: null,
                program_key: null,
                finding_id: null,
                card_key: 'audit_program_f03:',
                missing_fields: [
                    'Kế hoạch chưa thuộc một chương trình đánh giá.',
                ],
                can_generate: false,
                history: [],
            });
        }

        if (!availableTypes.has('audit_team_assignment_f04')) {
            const insertIndex = Math.min(1, documentCards.length);
            documentCards.splice(insertIndex, 0, {
                document_type: 'audit_team_assignment_f04',
                stored_document_type: 'audit_team_assignment_f04',
                form_code: 'F.04-P.09',
                label: 'Chỉ định đoàn đánh giá',
                entity_type: 'audit_team_appointment',
                entity_id: '',
                member_id: null,
                program_key: null,
                finding_id: null,
                card_key: 'audit_team_assignment_f04:',
                missing_fields: [
                    'Hồ sơ chưa có quyết định chỉ định đoàn cấp hồ sơ.',
                ],
                can_generate: false,
                history: [],
            });
        }

        return {
            plan: {
                id: built.plan.id,
                plan_code: built.plan.plan_code,
                audit_type: built.plan.audit_type ??
                    built.plan.audit_event?.event_type,
                planned_start_date:
                    built.plan.planned_start_date,
                planned_end_date:
                    built.plan.planned_end_date,
            },
            supplemental_data: {
                audit_language: this.displayText(
                    documentData.audit_language,
                    'Tiếng Việt',
                ),
                issue_date: this.displayText(
                    documentData.issue_date,
                    new Date().toISOString().slice(0, 10),
                ),
                schedule_rows: scheduleRows,
                opening_date: this.displayText(
                    documentData.opening_date,
                    built.plan.planned_start_date
                        ? new Date(built.plan.planned_start_date)
                            .toISOString().slice(0, 10)
                        : new Date().toISOString().slice(0, 10),
                ),
                opening_time: this.displayText(
                    documentData.opening_time,
                    '08:00',
                ),
                closing_date: this.displayText(
                    documentData.closing_date,
                    built.plan.planned_end_date
                        ? new Date(built.plan.planned_end_date)
                            .toISOString().slice(0, 10)
                        : new Date().toISOString().slice(0, 10),
                ),
                closing_time: this.displayText(
                    documentData.closing_time,
                    '16:30',
                ),
                attendance_rows: this.normalizeAttendanceRows(
                    documentData.attendance_rows,
                    built.plan,
                ),
                checklists: this.normalizeChecklistPrograms(built.plan).map((item) => ({
                    program_key: item.program_key,
                    program_code: item.program_code,
                    management_system: item.management_system,
                    source_label: item.source_label,
                    auditor_name: item.auditor_name,
                    rows: item.rows,
                })),
            },
            documents: documentCards,
        };
    }

    async saveData(
        planId: string,
        dto: SaveAuditDocumentDataDto,
        userId?: string,
    ) {
        const plan = await this.loadPlan(planId);
        await this.assertGenerationAccess(userId, plan);

        if (
            dto.schedule_rows &&
            dto.schedule_rows.length > 100
        ) {
            throw new BadRequestException(
                'Lịch trình chi tiết không được vượt quá 100 dòng',
            );
        }
        if (
            dto.attendance_rows &&
            dto.attendance_rows.length > 100
        ) {
            throw new BadRequestException(
                'Danh sách tham dự không được vượt quá 100 người',
            );
        }
        if (dto.checklists) {
            const allowed = new Map(
                this.checklistLibrariesForPlan(plan).map((item) => [item.program_key, item]),
            );
            for (const checklist of dto.checklists) {
                const library = allowed.get(checklist.program_key);
                if (!library) {
                    throw new BadRequestException(
                        `Chương trình ${checklist.program_key} không thuộc phạm vi kế hoạch`,
                    );
                }
                if (checklist.rows.length !== library.rows.length) {
                    throw new BadRequestException(
                        `Bảng kiểm ${library.program_code} phải có đúng ${library.rows.length} dòng theo mẫu`,
                    );
                }
            }
        }

        const current = this.parseJson(plan.form_data);
        const existing = this.nested(
            current,
            'document_generation',
        );
        const nextDocumentData = {
            ...(this.isPlainObject(existing) ? existing : {}),
            ...(dto.audit_language !== undefined
                ? {
                    audit_language:
                        dto.audit_language.trim() || 'Tiếng Việt',
                }
                : {}),
            ...(dto.issue_date !== undefined
                ? {
                    issue_date: dto.issue_date,
                }
                : {}),
            ...(dto.schedule_rows !== undefined
                ? {
                    schedule_rows: dto.schedule_rows.map((row) => ({
                        time: row.time.trim(),
                        content: row.content.trim(),
                        auditor: row.auditor.trim(),
                        auditee: row.auditee.trim(),
                    })),
                }
                : {}),
            ...(dto.opening_date !== undefined
                ? { opening_date: dto.opening_date }
                : {}),
            ...(dto.opening_time !== undefined
                ? { opening_time: dto.opening_time.trim() }
                : {}),
            ...(dto.closing_date !== undefined
                ? { closing_date: dto.closing_date }
                : {}),
            ...(dto.closing_time !== undefined
                ? { closing_time: dto.closing_time.trim() }
                : {}),
            ...(dto.attendance_rows !== undefined
                ? {
                    attendance_rows: dto.attendance_rows.map((row) => ({
                        full_name: row.full_name.trim(),
                        department_title:
                            row.department_title.trim(),
                        opening_attended: row.opening_attended,
                        closing_attended: row.closing_attended,
                    })),
                }
                : {}),
            ...(dto.checklists !== undefined
                ? {
                    checklists: dto.checklists.map((checklist) => ({
                        program_key: checklist.program_key.trim(),
                        program_code: checklist.program_code.trim(),
                        management_system: checklist.management_system.trim(),
                        auditor_name: checklist.auditor_name.trim(),
                        rows: checklist.rows.map((row) => ({
                            row_id: row.row_id.trim(),
                            clause: row.clause.trim(),
                            content: row.content.trim(),
                            is_section: row.is_section,
                            result: row.is_section
                                ? 'NOT_EVALUATED'
                                : row.result,
                            description: row.is_section
                                ? ''
                                : row.description.trim(),
                        })),
                    })),
                }
                : {}),
            updated_at: new Date().toISOString(),
            updated_by: userId ?? null,
        };

        const nextFormData = this.deepMerge(current, {
            document_generation: nextDocumentData,
        });

        await this.prisma.audit_plans.update({
            where: {
                id: planId,
            },
            data: {
                form_data: JSON.stringify(nextFormData),
            },
        });

        if (userId) {
            await this.prisma.audit_logs.create({
                data: {
                    user_id: userId,
                    action: 'SAVE_AUDIT_DOCUMENT_DATA',
                    entity_type: 'audit_plan',
                    entity_id: planId,
                },
            });
        }

        return this.preview(planId);
    }

    private async convertToPdf(
        docxPath: string,
        pdfPath: string,
    ) {
        await convertDocxToPdf(
            docxPath,
            pdfPath,
            600_000,
        );
    }

    private selectDocument(
        built: any,
        requestType: string,
        memberId?: string,
        programKey?: string,
        findingId?: string,
    ) {
        const document = built.documents.find((item) =>
            item.definition.requestType === requestType &&
            (
                requestType !== 'audit_log_f15' ||
                item.definition.memberId === memberId
            ) && (
                requestType !== 'audit_checklist_f06' ||
                item.definition.programKey === programKey
            ) && (
                requestType !== 'corrective_action_request_f10' ||
                item.definition.findingId === findingId
            ),
        );

        if (!document) {
            if (requestType === 'audit_program_f03') {
                throw new BadRequestException(
                    'Kế hoạch chưa thuộc chương trình đánh giá để sinh F.03-P.09',
                );
            }
            if (requestType === 'audit_team_assignment_f04') {
                throw new BadRequestException(
                    'Hồ sơ chưa có quyết định chỉ định đoàn cấp hồ sơ để sinh F.04-P.09',
                );
            }
            if (requestType === 'audit_log_f15') {
                throw new BadRequestException(
                    'Không tìm thấy thành viên đoàn để sinh F.15-P.09',
                );
            }
            if (requestType === 'audit_checklist_f06') {
                throw new BadRequestException(
                    'Không tìm thấy chương trình/tiêu chuẩn để sinh F.06-P.09',
                );
            }
            if (requestType === 'corrective_action_request_f10') {
                throw new BadRequestException(
                    'Không tìm thấy NC để sinh F.10-P.09',
                );
            }
            if (requestType === 'technical_review_report_f11') {
                throw new BadRequestException(
                    'Kế hoạch chưa có hồ sơ thẩm xét để sinh F.11-P.09',
                );
            }
            throw new BadRequestException(
                'Loại tài liệu không khả dụng đối với kế hoạch này',
            );
        }

        return document;
    }

    async generate(
        planId: string,
        documentType: string,
        format: string,
        userId?: string,
        memberId?: string,
        programKey?: string,
        findingId?: string,
    ) {
        const normalizedType = String(documentType ?? '')
            .trim()
            .toLowerCase();
        const normalizedFormat = String(format ?? '')
            .trim()
            .toLowerCase() as DocumentFormat;

        if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
            throw new BadRequestException(
                'Loại tài liệu chỉ chấp nhận F.03, F.04, F.05, F.06, F.07, F.10, F.11, F.15 hoặc F.17',
            );
        }

        if (!ALLOWED_FORMATS.has(normalizedFormat)) {
            throw new BadRequestException(
                'Định dạng chỉ chấp nhận docx hoặc pdf',
            );
        }

        const built = await this.buildAll(planId);
        await this.assertGenerationAccess(userId, built.plan);
        if (normalizedType === 'audit_log_f15' && !memberId) {
            throw new BadRequestException(
                'Cần chọn thành viên đoàn để sinh F.15-P.09',
            );
        }
        if (normalizedType === 'audit_checklist_f06' && !programKey) {
            throw new BadRequestException(
                'Cần chọn chương trình/tiêu chuẩn để sinh F.06-P.09',
            );
        }
        if (normalizedType === 'corrective_action_request_f10' && !findingId) {
            throw new BadRequestException(
                'Cần chọn NC để sinh F.10-P.09',
            );
        }
        const document = this.selectDocument(
            built,
            normalizedType,
            memberId,
            programKey,
            findingId,
        );
        const definition = document.definition;
        const templatePath = this.templatePath(
            definition.templateFile,
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
            data: document.snapshot,
        });

        const customerCode = (
            document.snapshot as Record<string, unknown>
        ).customer_code;
        const sourceName = [
            definition.formCode,
            this.safeFileSegment(customerCode),
            this.safeFileSegment(built.plan.plan_code),
            ...(definition.fileNameSuffix
                ? [this.safeFileSegment(definition.fileNameSuffix)]
                : []),
        ].join('_');

        try {
            let registered;

            if (normalizedFormat === 'docx') {
                registered =
                    await this.documentFilesService.registerGenerated({
                        entity_type: definition.entityType,
                        entity_id: definition.entityId,
                        document_type: definition.documentType,
                        file_kind: 'generated_docx',
                        original_name: `${sourceName}.docx`,
                        stored_name: docxStoredName,
                        absolute_path: docxPath,
                        mime_type:
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        note:
                            `${definition.label} sinh tự động từ dữ liệu hệ thống tại thời điểm xuất.`,
                        uploaded_by: userId ?? null,
                    });
            } else {
                await this.convertToPdf(docxPath, pdfPath);

                if (existsSync(docxPath)) {
                    unlinkSync(docxPath);
                }

                registered =
                    await this.documentFilesService.registerGenerated({
                        entity_type: definition.entityType,
                        entity_id: definition.entityId,
                        document_type: definition.documentType,
                        file_kind: 'generated_pdf',
                        original_name: `${sourceName}.pdf`,
                        stored_name: pdfStoredName,
                        absolute_path: pdfPath,
                        mime_type: 'application/pdf',
                        note:
                            `${definition.label} PDF sinh từ cùng snapshot Word của dữ liệu hệ thống.`,
                        uploaded_by: userId ?? null,
                    });
            }

            if (userId) {
                await this.prisma.audit_logs.create({
                    data: {
                        user_id: userId,
                        action: `GENERATE_${definition.documentType.toUpperCase()}_${normalizedFormat.toUpperCase()}`,
                        entity_type: definition.entityType,
                        entity_id: definition.entityId,
                    },
                });
            }

            return {
                format: normalizedFormat,
                document_type: normalizedType,
                form_code: definition.formCode,
                label: definition.label,
                missing_fields: document.missingFields,
                document: registered,
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

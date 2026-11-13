import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import {
    AuditProgramEventDto,
    CopyAuditProgramDto,
    CreateAuditProgramDto,
} from './dto/create-audit-program.dto';

import { UpdateAuditProgramDto } from './dto/update-audit-program.dto';
import { UpdateAuditProgramEventDto } from './dto/update-audit-program-event.dto';
import { firstSurveillanceDeadline, isFirstSurveillanceEvent } from './surveillance-deadline';
import { hasCurrentGs1QmrApproval } from './p09-gs1-exception';

type JsonObject = Record<string, unknown>;

@Injectable()
export class AuditProgramsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private readonly detailInclude = {
        certification_projects: {
            include: {
                certification_applications: {
                    include: {
                        customers: true,
                    },
                },
                contracts: {
                    select: {
                        id: true,
                        contract_number: true,
                    },
                },
                certification_agreements: {
                    select: {
                        id: true,
                        agreement_number: true,
                    },
                },
            },
        },
        preparer: {
            select: {
                id: true,
                username: true,
                full_name: true,
                email: true,
            },
        },
        copied_from: {
            select: {
                id: true,
                program_code: true,
                program_year: true,
                version_no: true,
            },
        },
        events: {
            orderBy: {
                sequence_no: 'asc' as const,
            },
        },
    };

    private isPlainObject(
        value: unknown,
    ): value is JsonObject {
        return (
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value)
        );
    }

    private deepMerge(
        base: JsonObject,
        override: JsonObject,
    ): JsonObject {
        const result: JsonObject = {
            ...base,
        };

        for (const [key, value] of Object.entries(
            override,
        )) {
            const currentValue = result[key];

            if (
                this.isPlainObject(currentValue) &&
                this.isPlainObject(value)
            ) {
                result[key] = this.deepMerge(
                    currentValue,
                    value,
                );
            } else {
                result[key] = value;
            }
        }

        return result;
    }

    private serializeFormData(
        value:
            | Record<string, unknown>
            | null
            | undefined,
    ): string | null | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return null;
        }

        return JSON.stringify(value);
    }

    private parseFormData(
        value: string | null | undefined,
    ): unknown {
        if (!value) {
            return null;
        }

        try {
            return JSON.parse(value);
        } catch {
            return {
                invalid_json: true,
                raw_value: value,
            };
        }
    }

    private cloneJson<T>(value: T): T {
        return JSON.parse(JSON.stringify(value)) as T;
    }

    private normalizeEvent(event: any) {
        return {
            ...event,
            form_data: this.parseFormData(
                event.form_data,
            ),
        };
    }

    private normalizeProgram(program: any) {
        return {
            ...program,
            form_data: this.parseFormData(
                program.form_data,
            ),
            events:
                program.events?.map((event: any) =>
                    this.normalizeEvent(event),
                ) ?? [],
        };
    }

    private toNullableDate(
        value: string | null | undefined,
    ): Date | null | undefined {
        if (value === undefined) {
            return undefined;
        }

        if (value === null) {
            return null;
        }

        return new Date(value);
    }

    private validateDateRange(
        startDate: string | Date | null | undefined,
        endDate: string | Date | null | undefined,
        label: string,
    ) {
        if (!startDate || !endDate) {
            return;
        }

        if (
            new Date(startDate).getTime() >
            new Date(endDate).getTime()
        ) {
            throw new BadRequestException(
                `Ngày kết thúc ${label} phải sau hoặc bằng ngày bắt đầu`,
            );
        }
    }

    private async assertFirstSurveillanceDeadline(
        projectId: string,
        events: Array<{ id?: string; event_type: string; planned_start_date?: string | Date | null }>,
        programId?: string,
    ) {
        const scheduled = events.filter((item) =>
            isFirstSurveillanceEvent(item.event_type) && Boolean(item.planned_start_date),
        );
        if (!scheduled.length) return;

        // A prior certification decision is the timing authority, not program year
        // or a client's unverified input. No historical record is rewritten.
        const decision = await this.prisma.certification_decisions.findFirst({
            where: {
                project_id: projectId,
                status: 'issued',
                decision_result: 'approved',
                decision_type: { in: ['GRANT', 'RECERTIFY'] },
            },
            orderBy: [{ decision_date: 'desc' }, { created_at: 'desc' }],
            select: { id: true, decision_date: true },
        });
        if (!decision) return;

        const deadline = firstSurveillanceDeadline(decision.decision_date);
        for (const event of scheduled) {
            const plannedStart = new Date(event.planned_start_date!);
            if (Number.isNaN(plannedStart.getTime())) {
                throw new BadRequestException('Ngày đánh giá giám sát lần 1 không hợp lệ');
            }
            if (plannedStart.getTime() > deadline.getTime()) {
                const approved = programId && event.id
                    ? await hasCurrentGs1QmrApproval({
                        database: this.prisma,
                        eventId: event.id, programId, projectId,
                        decisionId: decision.id, decisionDate: decision.decision_date,
                        proposedDate: plannedStart,
                    })
                    : false;
                if (!approved) {
                    throw new BadRequestException(
                        `Giám sát lần 1 phải bắt đầu không quá 12 tháng từ ngày quyết định chứng nhận (hạn ${deadline.toISOString().slice(0, 10)}). Trường hợp ngoại lệ cần phê duyệt QMR theo P.09; chưa được tự ý bỏ qua điều kiện này.`,
                    );
                }
            }
        }
    }

    private validateEvents(
        events: AuditProgramEventDto[],
    ) {
        const sequenceNumbers = events.map(
            (event, index) =>
                event.sequence_no ?? index + 1,
        );

        if (
            new Set(sequenceNumbers).size !==
            sequenceNumbers.length
        ) {
            throw new BadRequestException(
                'Số thứ tự cuộc đánh giá không được trùng nhau',
            );
        }

        for (const event of events) {
            this.validateDateRange(
                event.planned_start_date,
                event.planned_end_date,
                `dự kiến của ${event.event_type}`,
            );

            this.validateDateRange(
                event.actual_start_date,
                event.actual_end_date,
                `thực tế của ${event.event_type}`,
            );
        }
    }

    private async generateProgramCode(
        programYear: number,
    ): Promise<string> {
        const prefix = `AP-${programYear}-`;

        const latest =
            await this.prisma.audit_programs.findFirst({
                where: {
                    program_code: {
                        startsWith: prefix,
                    },
                },
                orderBy: {
                    program_code: 'desc',
                },
                select: {
                    program_code: true,
                },
            });

        let nextNumber = 1;

        if (latest) {
            const currentNumber = Number(
                latest.program_code.replace(
                    prefix,
                    '',
                ),
            );

            if (!Number.isNaN(currentNumber)) {
                nextNumber = currentNumber + 1;
            }
        }

        return `${prefix}${String(nextNumber).padStart(
            4,
            '0',
        )}`;
    }

    private getInitialEvents(): AuditProgramEventDto[] {
        return [
            {
                sequence_no: 1,
                event_type: 'stage1',
                status: 'planned',
            },
            {
                sequence_no: 2,
                event_type: 'stage2',
                status: 'planned',
            },
        ];
    }

    private getNextEvents(
        sourceEvents: Array<{
            event_type: string;
        }>,
    ): AuditProgramEventDto[] {
        const eventTypes = new Set(
            sourceEvents.map(
                (event) => event.event_type,
            ),
        );

        let nextEventType = 'surveillance1';

        if (
            eventTypes.has('recertification')
        ) {
            // A copied programme after recertification starts the next cycle.
            nextEventType = 'surveillance1';
        } else if (eventTypes.has('surveillance2')) {
            nextEventType = 'recertification';
        } else if (eventTypes.has('surveillance1')) {
            nextEventType = 'surveillance2';
        } else if (eventTypes.has('stage1') || eventTypes.has('stage2')) {
            nextEventType = 'surveillance1';
        }

        return [
            {
                sequence_no: 1,
                event_type: nextEventType,
                status: 'planned',
            },
        ];
    }

    private buildDefaultFormData(
        customer: any,
        primaryContact: any,
        application: any,
    ): JsonObject {
        const sites = customer.address
            ? [
                {
                    site_no: 1,
                    site_name:
                        customer.company_name,
                    address: customer.address,
                    is_central_function: true,
                    is_temporary_site: false,
                    is_active: true,
                    remarks: null,
                },
            ]
            : [];

        return {
            representative: {
                name: null,
                position: null,
                phone: null,
                fax: null,
                email: null,
            },

            contact: {
                name:
                    primaryContact?.full_name ??
                    null,
                position:
                    primaryContact?.position ??
                    null,
                phone:
                    primaryContact?.phone ??
                    customer.phone ??
                    null,
                fax: null,
                email:
                    primaryContact?.email ??
                    customer.email ??
                    null,
            },

            personnel_by_shift: {
                total_shift_count:
                    application.shift_count ??
                    null,
                shift_1: null,
                shift_2: null,
                shift_3: null,
                other: null,
            },

            certification_details: {
                excluded_clauses: null,
                audit_criteria:
                    application.standard_name,
                other_certification_type: null,
            },

            sites,

            update_factors: [
                {
                    factor_no: 1,
                    factor_code:
                        'COMPLAINTS_AND_CONCERNS',
                    factor_name:
                        'Khiếu nại, phản ánh và quan ngại của khách hàng hoặc các bên quan tâm',
                    has_change: false,
                    updated_content: null,
                    remarks: null,
                },
                {
                    factor_no: 2,
                    factor_code:
                        'CERTIFICATION_OR_LEGAL_CHANGE',
                    factor_name:
                        'Thay đổi yêu cầu chứng nhận, tiêu chuẩn, pháp luật hoặc yêu cầu chế định',
                    has_change: false,
                    updated_content: null,
                    remarks: null,
                },
                {
                    factor_no: 3,
                    factor_code:
                        'SCOPE_OR_ORGANIZATION_CHANGE',
                    factor_name:
                        'Thay đổi phạm vi, quy mô, địa điểm, nhân sự, quá trình hoặc cơ cấu tổ chức',
                    has_change: false,
                    updated_content: null,
                    remarks: null,
                },
                {
                    factor_no: 4,
                    factor_code:
                        'COMBINED_OR_INTEGRATED_AUDIT',
                    factor_name:
                        'Đánh giá kết hợp, đánh giá tích hợp hoặc đồng đánh giá',
                    has_change: false,
                    updated_content: null,
                    remarks: null,
                },
            ],

            other_information: {},
            notes: [],
        };
    }

    private resetAnnualFormData(
        sourceFormData: unknown,
        sourceYear: number,
    ): JsonObject {
        const copiedData = this.isPlainObject(
            sourceFormData,
        )
            ? this.cloneJson(sourceFormData)
            : {};

        const updateFactors =
            copiedData.update_factors;

        if (Array.isArray(updateFactors)) {
            copiedData.update_factors =
                updateFactors.map((factor) => {
                    if (!this.isPlainObject(factor)) {
                        return factor;
                    }

                    return {
                        ...factor,
                        has_change: false,
                        updated_content: null,
                        remarks: null,
                    };
                });
        }

        copiedData.notes = [];
        copiedData.copied_from_year =
            sourceYear;

        return copiedData;
    }

    private async findRawProgram(id: string) {
        const program =
            await this.prisma.audit_programs.findUnique({
                where: {
                    id,
                },
                include: this.detailInclude,
            });

        if (!program) {
            throw new NotFoundException(
                'Không tìm thấy chương trình đánh giá',
            );
        }

        return program;
    }

    async create(
        dto: CreateAuditProgramDto,
        preparedBy?: string,
    ) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id: dto.project_id,
                },
                include: {
                    certification_applications: {
                        include: {
                            customers: {
                                include: {
                                    contacts: true,
                                },
                            },
                        },
                    },
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }


        const issuedProjectAppointment =
            await this.prisma.audit_team_appointments.findFirst({
                where: {
                    status:
                        'issued',

                    audit_plans: {
                        project_id:
                            dto.project_id,

                        audit_type:
                            'project_team',
                    },
                },

                select: {
                    id:
                        true,

                    appointment_number:
                        true,
                },
            });

        if (
            !issuedProjectAppointment
        ) {
            throw new BadRequestException(
                `Hồ sơ ${project.project_code} chưa có chỉ định đoàn đánh giá được ban hành. Hãy chỉ định đoàn theo mã hồ sơ trước khi lập chương trình đánh giá.`,
            );
        }

        const application =
            project.certification_applications;

        const customer =
            application.customers;

        const primaryContact =
            customer.contacts[0];

        const latestVersion =
            await this.prisma.audit_programs.findFirst({
                where: {
                    project_id: dto.project_id,
                    program_year:
                        dto.program_year,
                },
                orderBy: {
                    version_no: 'desc',
                },
                select: {
                    version_no: true,
                },
            });

        const versionNo =
            (latestVersion?.version_no ?? 0) + 1;

        const programCode =
            await this.generateProgramCode(
                dto.program_year,
            );

        const events =
            dto.events?.length
                ? dto.events
                : this.getInitialEvents();

        this.validateEvents(events);
        await this.assertFirstSurveillanceDeadline(dto.project_id, events);

        const defaultFormData =
            this.buildDefaultFormData(
                customer,
                primaryContact,
                application,
            );

        const formData = dto.form_data
            ? this.deepMerge(
                defaultFormData,
                dto.form_data,
            )
            : defaultFormData;

        const program =
            await this.prisma.audit_programs.create({
                data: {
                    project_id: dto.project_id,
                    program_code: programCode,
                    program_year:
                        dto.program_year,
                    version_no: versionNo,

                    customer_code:
                        dto.customer_code ??
                        customer.customer_code,

                    organization_name:
                        dto.organization_name ??
                        customer.company_name,

                    address:
                        dto.address ??
                        customer.address,

                    standard_name:
                        dto.standard_name ??
                        project.standard_name ??
                        application.standard_name,

                    certification_scope:
                        dto.certification_scope ??
                        application.certification_scope,

                    effective_personnel:
                        dto.effective_personnel ??
                        application.employee_count,

                    certification_type:
                        dto.certification_type ??
                        application.certification_type ??
                        'INITIAL',

                    cycle_number:
                        dto.cycle_number ?? 1,

                    status:
                        dto.status ?? 'draft',

                    form_data:
                        this.serializeFormData(
                            formData,
                        ),

                    prepared_by: preparedBy,

                    events: {
                        create: events.map(
                            (event, index) => ({
                                sequence_no:
                                    event.sequence_no ??
                                    index + 1,

                                event_type:
                                    event.event_type,

                                planned_start_date:
                                    this.toNullableDate(
                                        event.planned_start_date,
                                    ),

                                planned_end_date:
                                    this.toNullableDate(
                                        event.planned_end_date,
                                    ),

                                actual_start_date:
                                    this.toNullableDate(
                                        event.actual_start_date,
                                    ),

                                actual_end_date:
                                    this.toNullableDate(
                                        event.actual_end_date,
                                    ),

                                planned_mandays:
                                    event.planned_mandays,

                                actual_mandays:
                                    event.actual_mandays,

                                status:
                                    event.status ??
                                    'planned',

                                form_data:
                                    this.serializeFormData(
                                        event.form_data,
                                    ),
                            }),
                        ),
                    },
                },

                include: this.detailInclude,
            });

        return this.normalizeProgram(program);
    }

    async copy(
        id: string,
        dto: CopyAuditProgramDto,
        preparedBy?: string,
    ) {
        const source =
            await this.findRawProgram(id);

        if (
            dto.program_year <=
            source.program_year
        ) {
            throw new BadRequestException(
                'Năm của chương trình mới phải sau năm của chương trình được sao chép',
            );
        }

        const existing =
            await this.prisma.audit_programs.findFirst({
                where: {
                    project_id:
                        source.project_id,
                    program_year:
                        dto.program_year,
                },
                select: {
                    id: true,
                    program_code: true,
                },
            });

        if (existing) {
            throw new BadRequestException(
                `Dự án đã có chương trình đánh giá năm ${dto.program_year}: ${existing.program_code}`,
            );
        }

        const sourceFormData =
            this.parseFormData(
                source.form_data,
            );

        const resetFormData =
            this.resetAnnualFormData(
                sourceFormData,
                source.program_year,
            );

        const formData = dto.form_data
            ? this.deepMerge(
                resetFormData,
                dto.form_data,
            )
            : resetFormData;

        const events = this.getNextEvents(
            source.events,
        );

        const sourceHasRecertification =
            source.events.some(
                (event) =>
                    event.event_type ===
                    'recertification',
            );

        const programCode =
            await this.generateProgramCode(
                dto.program_year,
            );

        const copiedProgram =
            await this.prisma.audit_programs.create({
                data: {
                    project_id:
                        source.project_id,

                    copied_from_program_id:
                        source.id,

                    program_code: programCode,

                    program_year:
                        dto.program_year,

                    version_no: 1,

                    customer_code:
                        source.customer_code,

                    organization_name:
                        source.organization_name,

                    address: source.address,

                    standard_name:
                        source.standard_name,

                    certification_scope:
                        source.certification_scope,

                    effective_personnel:
                        source.effective_personnel,

                    certification_type:
                        source.certification_type,

                    cycle_number:
                        sourceHasRecertification
                            ? source.cycle_number + 1
                            : source.cycle_number,

                    status:
                        dto.status ?? 'draft',

                    form_data:
                        this.serializeFormData(
                            formData,
                        ),

                    prepared_by: preparedBy,

                    events: {
                        create: events.map(
                            (event, index) => ({
                                sequence_no:
                                    event.sequence_no ??
                                    index + 1,

                                event_type:
                                    event.event_type,

                                status:
                                    event.status ??
                                    'planned',

                                form_data:
                                    this.serializeFormData(
                                        event.form_data,
                                    ),
                            }),
                        ),
                    },
                },

                include: this.detailInclude,
            });

        return this.normalizeProgram(
            copiedProgram,
        );
    }

    async findAll() {
        const programs =
            await this.prisma.audit_programs.findMany({
                orderBy: [
                    {
                        program_year: 'desc',
                    },
                    {
                        version_no: 'desc',
                    },
                    {
                        created_at: 'desc',
                    },
                ],
                include: this.detailInclude,
            });

        return programs.map((program) =>
            this.normalizeProgram(program),
        );
    }

    async findByProject(projectId: string) {
        const project =
            await this.prisma.certification_projects.findUnique({
                where: {
                    id: projectId,
                },
                select: {
                    id: true,
                },
            });

        if (!project) {
            throw new NotFoundException(
                'Không tìm thấy dự án chứng nhận',
            );
        }

        const programs =
            await this.prisma.audit_programs.findMany({
                where: {
                    project_id: projectId,
                },
                orderBy: [
                    {
                        program_year: 'desc',
                    },
                    {
                        version_no: 'desc',
                    },
                ],
                include: this.detailInclude,
            });

        return programs.map((program) =>
            this.normalizeProgram(program),
        );
    }

    async findOne(id: string) {
        const program =
            await this.findRawProgram(id);

        return this.normalizeProgram(program);
    }

    async update(
        id: string,
        dto: UpdateAuditProgramDto,
    ) {
        const current =
            await this.findRawProgram(id);

        if (current.status === 'completed') {
            throw new BadRequestException(
                'Không thể sửa chương trình đánh giá đã hoàn thành',
            );
        }

        let serializedFormData:
            | string
            | null
            | undefined;

        if (dto.form_data !== undefined) {
            if (dto.form_data === null) {
                serializedFormData = null;
            } else {
                const currentFormData =
                    this.parseFormData(
                        current.form_data,
                    );

                const mergedFormData =
                    this.deepMerge(
                        this.isPlainObject(
                            currentFormData,
                        )
                            ? currentFormData
                            : {},
                        dto.form_data,
                    );

                serializedFormData =
                    this.serializeFormData(
                        mergedFormData,
                    );
            }
        }


        if (
            dto.status === 'issued' &&
            current.status !== 'issued'
        ) {
            const issuedProjectAppointment =
                await this.prisma.audit_team_appointments.findFirst({
                    where: {
                        status:
                            'issued',

                        audit_plans: {
                            project_id:
                                current.project_id,

                            audit_type:
                                'project_team',
                        },
                    },

                    select: {
                        id:
                            true,
                    },
                });

            if (
                !issuedProjectAppointment
            ) {
                throw new BadRequestException(
                    `Hồ sơ ${current.certification_projects.project_code} chưa có chỉ định đoàn đánh giá được ban hành.`,
                );
            }
        }

        if (dto.status === 'issued') {
            await this.assertFirstSurveillanceDeadline(
                current.project_id,
                current.events,
                current.id,
            );
        }

        const updated =
            await this.prisma.audit_programs.update({
                where: {
                    id,
                },
                data: {
                    customer_code:
                        dto.customer_code,

                    organization_name:
                        dto.organization_name,

                    address: dto.address,

                    standard_name:
                        dto.standard_name,

                    certification_scope:
                        dto.certification_scope,

                    effective_personnel:
                        dto.effective_personnel,

                    certification_type:
                        dto.certification_type,

                    cycle_number:
                        dto.cycle_number,

                    status: dto.status,

                    form_data:
                        serializedFormData,
                },

                include: this.detailInclude,
            });

        return this.normalizeProgram(updated);
    }

    async addEvent(
        programId: string,
        dto: AuditProgramEventDto,
    ) {
        const program =
            await this.findRawProgram(programId);

        if (program.status === 'completed') {
            throw new BadRequestException(
                'Không thể thêm cuộc đánh giá vào chương trình đã hoàn thành',
            );
        }

        this.validateEvents([dto]);
        await this.assertFirstSurveillanceDeadline(program.project_id, [dto]);

        const latestEvent =
            await this.prisma.audit_program_events.findFirst({
                where: {
                    program_id: programId,
                },
                orderBy: {
                    sequence_no: 'desc',
                },
                select: {
                    sequence_no: true,
                },
            });

        const sequenceNo =
            dto.sequence_no ??
            (latestEvent?.sequence_no ?? 0) + 1;

        const duplicateSequence =
            await this.prisma.audit_program_events.findFirst({
                where: {
                    program_id: programId,
                    sequence_no: sequenceNo,
                },
                select: {
                    id: true,
                },
            });

        if (duplicateSequence) {
            throw new BadRequestException(
                `Số thứ tự ${sequenceNo} đã tồn tại trong chương trình`,
            );
        }

        const event =
            await this.prisma.audit_program_events.create({
                data: {
                    program_id: programId,
                    sequence_no: sequenceNo,
                    event_type: dto.event_type,

                    planned_start_date:
                        this.toNullableDate(
                            dto.planned_start_date,
                        ),

                    planned_end_date:
                        this.toNullableDate(
                            dto.planned_end_date,
                        ),

                    actual_start_date:
                        this.toNullableDate(
                            dto.actual_start_date,
                        ),

                    actual_end_date:
                        this.toNullableDate(
                            dto.actual_end_date,
                        ),

                    planned_mandays:
                        dto.planned_mandays,

                    actual_mandays:
                        dto.actual_mandays,

                    status:
                        dto.status ?? 'planned',

                    form_data:
                        this.serializeFormData(
                            dto.form_data,
                        ),
                },
            });

        return this.normalizeEvent(event);
    }

    async updateEvent(
        programId: string,
        eventId: string,
        dto: UpdateAuditProgramEventDto,
    ) {
        const program =
            await this.findRawProgram(programId);

        if (program.status === 'completed') {
            throw new BadRequestException(
                'Không thể sửa cuộc đánh giá trong chương trình đã hoàn thành',
            );
        }

        const event =
            await this.prisma.audit_program_events.findFirst({
                where: {
                    id: eventId,
                    program_id: programId,
                },
            });

        if (!event) {
            throw new NotFoundException(
                'Không tìm thấy cuộc đánh giá trong chương trình',
            );
        }

        const plannedStart =
            dto.planned_start_date ===
                undefined
                ? event.planned_start_date
                : this.toNullableDate(
                    dto.planned_start_date,
                );

        const plannedEnd =
            dto.planned_end_date === undefined
                ? event.planned_end_date
                : this.toNullableDate(
                    dto.planned_end_date,
                );

        const actualStart =
            dto.actual_start_date ===
                undefined
                ? event.actual_start_date
                : this.toNullableDate(
                    dto.actual_start_date,
                );

        const actualEnd =
            dto.actual_end_date === undefined
                ? event.actual_end_date
                : this.toNullableDate(
                    dto.actual_end_date,
                );

        this.validateDateRange(
            plannedStart,
            plannedEnd,
            'dự kiến',
        );
        await this.assertFirstSurveillanceDeadline(program.project_id, [{
            id: event.id,
            event_type: dto.event_type ?? event.event_type,
            planned_start_date: plannedStart,
        }], programId);

        this.validateDateRange(
            actualStart,
            actualEnd,
            'thực tế',
        );

        if (
            dto.sequence_no !== undefined &&
            dto.sequence_no !== event.sequence_no
        ) {
            const duplicateSequence =
                await this.prisma.audit_program_events.findFirst({
                    where: {
                        program_id: programId,
                        sequence_no:
                            dto.sequence_no,
                        id: {
                            not: eventId,
                        },
                    },
                    select: {
                        id: true,
                    },
                });

            if (duplicateSequence) {
                throw new BadRequestException(
                    `Số thứ tự ${dto.sequence_no} đã tồn tại trong chương trình`,
                );
            }
        }

        let serializedFormData:
            | string
            | null
            | undefined;

        if (dto.form_data !== undefined) {
            if (dto.form_data === null) {
                serializedFormData = null;
            } else {
                const currentFormData =
                    this.parseFormData(
                        event.form_data,
                    );

                const mergedFormData =
                    this.deepMerge(
                        this.isPlainObject(
                            currentFormData,
                        )
                            ? currentFormData
                            : {},
                        dto.form_data,
                    );

                serializedFormData =
                    this.serializeFormData(
                        mergedFormData,
                    );
            }
        }

        const updatedEvent =
            await this.prisma.audit_program_events.update({
                where: {
                    id: eventId,
                },
                data: {
                    sequence_no:
                        dto.sequence_no,

                    event_type:
                        dto.event_type,

                    planned_start_date:
                        this.toNullableDate(
                            dto.planned_start_date,
                        ),

                    planned_end_date:
                        this.toNullableDate(
                            dto.planned_end_date,
                        ),

                    actual_start_date:
                        this.toNullableDate(
                            dto.actual_start_date,
                        ),

                    actual_end_date:
                        this.toNullableDate(
                            dto.actual_end_date,
                        ),

                    planned_mandays:
                        dto.planned_mandays,

                    actual_mandays:
                        dto.actual_mandays,

                    status: dto.status,

                    form_data:
                        serializedFormData,
                },
            });

        return this.normalizeEvent(
            updatedEvent,
        );
    }

    async removeEvent(
        programId: string,
        eventId: string,
    ) {
        const program =
            await this.findRawProgram(programId);

        if (program.status === 'completed') {
            throw new BadRequestException(
                'Không thể xóa cuộc đánh giá khỏi chương trình đã hoàn thành',
            );
        }

        const event =
            await this.prisma.audit_program_events.findFirst({
                where: {
                    id: eventId,
                    program_id: programId,
                },
                select: {
                    id: true,
                },
            });

        if (!event) {
            throw new NotFoundException(
                'Không tìm thấy cuộc đánh giá trong chương trình',
            );
        }

        await this.prisma.audit_program_events.delete({
            where: {
                id: eventId,
            },
        });

        return {
            message:
                'Đã xóa cuộc đánh giá khỏi chương trình',
        };
    }

    async remove(id: string) {
        const program =
            await this.findRawProgram(id);

        if (program.status !== 'draft') {
            throw new BadRequestException(
                'Chỉ được xóa chương trình đánh giá ở trạng thái dự thảo',
            );
        }

        const copiedProgramCount =
            await this.prisma.audit_programs.count({
                where: {
                    copied_from_program_id: id,
                },
            });

        if (copiedProgramCount > 0) {
            throw new BadRequestException(
                'Không thể xóa vì đã có chương trình năm sau được sao chép từ chương trình này',
            );
        }

        await this.prisma.$transaction(
            async (transaction) => {
                await transaction.audit_program_events.deleteMany({
                    where: {
                        program_id: id,
                    },
                });

                await transaction.audit_programs.delete({
                    where: {
                        id,
                    },
                });
            },
        );

        return {
            message:
                'Đã xóa chương trình đánh giá',
        };
    }
}

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    Prisma,
} from '@prisma/client';

import {
    existsSync,
    unlinkSync,
} from 'fs';

import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService } from '../security/resource-access.service';
import type { ResourceActor } from '../security/resource-access.service';
import { resolveDocumentStoragePath } from '../common/storage-config';
import { calculateFileSha256 } from '../common/file-integrity';
import {
    promoteValidatedUpload,
    validateGeneratedDocument,
    validateUploadedFile,
    verifyStoredFileIntegrity,
} from '../common/upload-security';

import { UploadDocumentFileDto } from './dto/upload-document-file.dto';
import { UploadCustomerCorrectiveActionEvidenceDto } from './dto/upload-customer-corrective-action-evidence.dto';
import { UploadCustomerOrganizationChangeAttachmentDto } from '../customer-portal/dto/upload-customer-organization-change-attachment.dto';

interface DocumentProjectContextSource {
    id: string;
    project_code: string;
    standard_name?: string | null;
    certification_applications: {
        id: string;
        application_code: string;
        customers: {
            id: string;
            customer_code: string;
            company_name: string;
        };
    };
}


interface RegisterGeneratedDocumentInput {
    entity_type: string;
    entity_id: string;
    document_type: string;
    file_kind: 'generated_docx' | 'generated_xlsx' | 'generated_pdf';
    original_name: string;
    stored_name: string;
    absolute_path: string;
    mime_type: string;
    note?: string | null;
    uploaded_by?: string | null;
}

interface DocumentEntityContext {
    reference_code: string;
    project_id: string | null;
    project_code: string | null;
    application_id: string;
    application_code: string;
    customer_id: string;
    customer_code: string;
    company_name: string;
    standard_name?: string | null;
}

@Injectable()
export class DocumentFilesService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly resourceAccess: ResourceAccessService,
    ) { }

    private withDownloadUrl<
        T extends {
            id: string;
        },
    >(documentFile: T) {
        return {
            ...documentFile,
            download_url:
                `/document-files/${documentFile.id}/download`,
        };
    }

    private withCustomerDownloadUrl<
        T extends {
            id: string;
        },
    >(documentFile: T) {
        return {
            ...documentFile,
            download_url:
                `/document-files/customer/${documentFile.id}/download`,
        };
    }

    private projectContext(
        project: DocumentProjectContextSource,
        referenceCode?: string | null,
    ) {
        return {
            reference_code:
                referenceCode ??
                project.project_code,
            project_id:
                project.id,
            project_code:
                project.project_code,
            application_id:
                project.certification_applications.id,
            application_code:
                project.certification_applications.application_code,
            customer_id:
                project.certification_applications.customers.id,
            customer_code:
                project.certification_applications.customers.customer_code,
            company_name:
                project.certification_applications.customers.company_name,
            standard_name:
                project.standard_name,
        } satisfies DocumentEntityContext;
    }

    async findAll(
        actor?: ResourceActor,
    ) {
        const allDocumentFiles =
            await this.prisma.documentFile.findMany({
                orderBy: [
                    {
                        created_at:
                            'desc',
                    },
                    {
                        version_no:
                            'desc',
                    },
                ],
            });

        const documentFiles =
            actor
                ? await this.resourceAccess.filterDocumentEntities(
                    allDocumentFiles,
                    actor,
                )
                : allDocumentFiles;

        const normalize = (
            value?: string | null,
        ) =>
            (value ?? '')
                .trim()
                .toLowerCase();

        const entityIds = (
            ...entityTypes: string[]
        ) =>
            Array.from(
                new Set(
                    documentFiles
                        .filter((file) =>
                            entityTypes.includes(
                                normalize(file.entity_type),
                            ),
                        )
                        .map((file) =>
                            file.entity_id,
                        ),
                ),
            );

        const technicalReviewIds =
            entityIds(
                'technical_review',
                'technical_reviews',
            );

        const certificateIds =
            entityIds(
                'certificate',
                'certificates',
            );

        const reportIds =
            entityIds(
                'report',
                'reports',
            );

        const auditPlanIds =
            entityIds(
                'audit_plan',
                'audit_plans',
            );

        const projectIds =
            entityIds(
                'certification_project',
                'certification_projects',
                'project',
            );

        const applicationIds =
            entityIds(
                'certification_application',
                'certification_applications',
                'application',
            );

        const uploadedByIds =
            Array.from(
                new Set(
                    documentFiles
                        .map((file) =>
                            file.uploaded_by,
                        )
                        .filter(
                            (id): id is string =>
                                Boolean(id),
                        ),
                ),
            );

        const projectInclude = {
            certification_applications: {
                include: {
                    customers:
                        true,
                },
            },
        } as const;

        const [
            technicalReviews,
            certificates,
            reports,
            auditPlans,
            projects,
            applications,
            uploaders,
        ] =
            await Promise.all([
                this.prisma.technical_reviews.findMany({
                    where: {
                        id: {
                            in:
                                technicalReviewIds,
                        },
                    },
                    include: {
                        reports: {
                            include: {
                                audit_plans: {
                                    include: {
                                        certification_projects: {
                                            include:
                                                projectInclude,
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
                this.prisma.certificates.findMany({
                    where: {
                        id: {
                            in:
                                certificateIds,
                        },
                    },
                    include: {
                        technical_reviews: {
                            include: {
                                reports: {
                                    include: {
                                        audit_plans: {
                                            include: {
                                                certification_projects: {
                                                    include:
                                                        projectInclude,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                }),
                this.prisma.reports.findMany({
                    where: {
                        id: {
                            in:
                                reportIds,
                        },
                    },
                    include: {
                        audit_plans: {
                            include: {
                                certification_projects: {
                                    include:
                                        projectInclude,
                                },
                            },
                        },
                    },
                }),
                this.prisma.audit_plans.findMany({
                    where: {
                        id: {
                            in:
                                auditPlanIds,
                        },
                    },
                    include: {
                        certification_projects: {
                            include:
                                projectInclude,
                        },
                    },
                }),
                this.prisma.certification_projects.findMany({
                    where: {
                        id: {
                            in:
                                projectIds,
                        },
                    },
                    include:
                        projectInclude,
                }),
                this.prisma.certification_applications.findMany({
                    where: {
                        id: {
                            in:
                                applicationIds,
                        },
                    },
                    include: {
                        customers:
                            true,
                    },
                }),
                this.prisma.users.findMany({
                    where: {
                        id: {
                            in:
                                uploadedByIds,
                        },
                    },
                    select: {
                        id:
                            true,
                        username:
                            true,
                        full_name:
                            true,
                        email:
                            true,
                    },
                }),
            ]);

        const contextByEntity =
            new Map<
                string,
                DocumentEntityContext
            >();

        const contextKey = (
            entityType: string,
            entityId: string,
        ) =>
            `${normalize(entityType)}:${entityId}`;

        technicalReviews.forEach((review) => {
            const project =
                review.reports.audit_plans.certification_projects;

            const context =
                this.projectContext(
                    project,
                    review.reports.report_code,
                );

            [
                'technical_review',
                'technical_reviews',
            ].forEach((entityType) =>
                contextByEntity.set(
                    contextKey(entityType, review.id),
                    context,
                ),
            );
        });

        certificates.forEach((certificate) => {
            const project =
                certificate.technical_reviews.reports.audit_plans.certification_projects;

            const context =
                this.projectContext(
                    project,
                    certificate.cert_number,
                );

            [
                'certificate',
                'certificates',
            ].forEach((entityType) =>
                contextByEntity.set(
                    contextKey(entityType, certificate.id),
                    context,
                ),
            );
        });

        reports.forEach((report) => {
            const context =
                this.projectContext(
                    report.audit_plans.certification_projects,
                    report.report_code,
                );

            [
                'report',
                'reports',
            ].forEach((entityType) =>
                contextByEntity.set(
                    contextKey(entityType, report.id),
                    context,
                ),
            );
        });

        auditPlans.forEach((auditPlan) => {
            const context =
                this.projectContext(
                    auditPlan.certification_projects,
                    auditPlan.plan_code,
                );

            [
                'audit_plan',
                'audit_plans',
            ].forEach((entityType) =>
                contextByEntity.set(
                    contextKey(entityType, auditPlan.id),
                    context,
                ),
            );
        });

        projects.forEach((project) => {
            const context =
                this.projectContext(project);

            [
                'certification_project',
                'certification_projects',
                'project',
            ].forEach((entityType) =>
                contextByEntity.set(
                    contextKey(entityType, project.id),
                    context,
                ),
            );
        });

        applications.forEach((application) => {
            const context = {
                reference_code:
                    application.application_code,
                project_id:
                    null,
                project_code:
                    null,
                application_id:
                    application.id,
                application_code:
                    application.application_code,
                customer_id:
                    application.customers.id,
                customer_code:
                    application.customers.customer_code,
                company_name:
                    application.customers.company_name,
                standard_name:
                    application.standard_name,
            } satisfies DocumentEntityContext;

            [
                'certification_application',
                'certification_applications',
                'application',
            ].forEach((entityType) =>
                contextByEntity.set(
                    contextKey(entityType, application.id),
                    context,
                ),
            );
        });

        const uploaderById =
            new Map(
                uploaders.map((uploader) => [
                    uploader.id,
                    uploader,
                ]),
            );

        const items =
            documentFiles.map((documentFile) => ({
                ...this.withDownloadUrl(documentFile),
                context:
                    contextByEntity.get(
                        contextKey(
                            documentFile.entity_type,
                            documentFile.entity_id,
                        ),
                    ) ??
                    null,
                uploaded_by_user:
                    documentFile.uploaded_by
                        ? uploaderById.get(
                            documentFile.uploaded_by,
                        ) ??
                        null
                        : null,
            }));

        return {
            generated_at:
                new Date(),
            summary: {
                total:
                    items.length,
                current:
                    items.filter((item) =>
                        item.is_current,
                    ).length,
                archived:
                    items.filter((item) =>
                        !item.is_current,
                    ).length,
                document_types:
                    new Set(
                        items.map((item) =>
                            normalize(item.document_type),
                        ),
                    ).size,
                linked_projects:
                    new Set(
                        items
                            .map((item) =>
                                item.context?.project_id,
                            )
                            .filter(Boolean),
                    ).size,
            },
            items,
        };
    }

    private removePhysicalFile(
        filePath?: string,
    ) {
        if (
            filePath &&
            existsSync(filePath)
        ) {
            unlinkSync(filePath);
        }
    }

    private getPrismaErrorCode(
        error: unknown,
    ) {
        if (
            typeof error !== 'object' ||
            error === null ||
            !('code' in error)
        ) {
            return null;
        }

        const code =
            (error as { code?: unknown }).code;

        return typeof code === 'string'
            ? code
            : null;
    }

    private async assertControlledLibraryFileAccess(
        entityTypeInput: string,
        entityId: string,
        actor?: ResourceActor,
    ) {
        const entityType = entityTypeInput.trim().toLowerCase().replace(/-/g, '_');
        if (!['document_library_version', 'controlled_template_version'].includes(entityType)) {
            return false;
        }
        const roles = new Set((actor?.roles ?? []).map((role) => role.trim().toUpperCase()));
        if (entityType === 'controlled_template_version') {
            if (!roles.has('ADMIN') && !roles.has('STAFF')) {
                throw new ForbiddenException('Chỉ Admin/Nhân viên quản lý tài liệu được thao tác tệp mẫu biểu');
            }
            const version = await this.prisma.controlled_template_versions.findUnique({ where: { id: entityId }, select: { id: true } });
            if (!version) throw new NotFoundException('Không tìm thấy phiên bản mẫu biểu');
            return true;
        }
        const version = await this.prisma.document_library_versions.findUnique({
            where: { id: entityId },
            include: { series: true },
        });
        if (!version) throw new NotFoundException('Không tìm thấy phiên bản tài liệu');
        if (roles.has('CUSTOMER')) {
            throw new ForbiddenException('Tài liệu nội bộ/bên ngoài không được mở từ cổng khách hàng');
        }
        if (version.series.access_scope === 'RESTRICTED' && !roles.has('ADMIN') && !roles.has('STAFF')) {
            throw new ForbiddenException('Tài liệu này được giới hạn cho bộ phận quản lý tài liệu');
        }
        return true;
    }

    async upload(
        dto: UploadDocumentFileDto,
        file: Express.Multer.File,
        uploadedBy?: string,
        actor?: ResourceActor,
    ) {
        if (!file) {
            throw new BadRequestException(
                'Chưa chọn file tải lên',
            );
        }

        const normalizedEntityType = dto.entity_type
            .trim()
            .toLowerCase()
            .replace(/-/g, '_');
        let controlledLibraryAccessHandled = false;
        if (['document_library_version', 'controlled_template_version'].includes(normalizedEntityType)) {
            const roles = new Set((actor?.roles ?? []).map((role) => role.trim().toUpperCase()));
            if (!roles.has('ADMIN') && !roles.has('STAFF')) {
                throw new ForbiddenException('Chỉ Admin/Nhân viên quản lý tài liệu được tải tệp cho thư viện tài liệu/mẫu biểu');
            }
            controlledLibraryAccessHandled = await this.assertControlledLibraryFileAccess(
                normalizedEntityType,
                dto.entity_id,
                actor,
            );
        }
        const expertGovernanceAdminOnlyEntities = [
            'expert_competency_evidence',
            'expert_training_record',
            'expert_monitoring_record',
        ];
        if (
            expertGovernanceAdminOnlyEntities.includes(normalizedEntityType) &&
            !(actor?.roles ?? []).some(
                (role) => role.trim().toUpperCase() === 'ADMIN',
            )
        ) {
            throw new ForbiddenException(
                normalizedEntityType === 'expert_competency_evidence'
                    ? 'Chỉ Admin được tải tệp bằng chứng năng lực chuyên gia'
                    : 'Chỉ Admin được tải tệp đào tạo/giám sát năng lực chuyên gia',
            );
        }

        if (actor && !controlledLibraryAccessHandled) {
            await this.resourceAccess.assertDocumentEntityAccess(
                {
                    entity_type: dto.entity_type,
                    entity_id: dto.entity_id,
                },
                actor,
            );
        }

        const validated = validateUploadedFile(
            file,
            dto.file_kind,
        );

        const promoted = promoteValidatedUpload(
            file,
            validated.extension,
        );

        const entityType = dto.entity_type.trim();
        const documentType = dto.document_type.trim();

        try {
            const documentFile =
                await this.prisma.$transaction(
                    async (tx) => {
                        const latestVersion =
                            await tx.documentFile.aggregate(
                                {
                                    where: {
                                        entity_type: entityType,
                                        entity_id: dto.entity_id,
                                        document_type: documentType,
                                        file_kind: dto.file_kind,
                                    },
                                    _max: {
                                        version_no: true,
                                    },
                                },
                            );

                        const nextVersion =
                            (latestVersion._max.version_no ?? 0) + 1;

                        await tx.documentFile.updateMany(
                            {
                                where: {
                                    entity_type: entityType,
                                    entity_id: dto.entity_id,
                                    document_type: documentType,
                                    file_kind: dto.file_kind,
                                    is_current: true,
                                },
                                data: {
                                    is_current: false,
                                },
                            },
                        );

                        return tx.documentFile.create(
                            {
                                data: {
                                    entity_type: entityType,
                                    entity_id: dto.entity_id,
                                    document_type: documentType,
                                    file_kind: dto.file_kind,
                                    original_name: validated.originalName,
                                    stored_name: promoted.storedName,
                                    file_url: `/uploads/documents/${promoted.storedName}`,
                                    mime_type: validated.mimeType,
                                    file_size: validated.fileSize,
                                    sha256: validated.sha256,
                                    version_no: nextVersion,
                                    is_current: true,
                                    note: dto.note?.trim() ?? null,
                                    uploaded_by: uploadedBy ?? null,
                                },
                            },
                        );
                    },
                );

            return this.withDownloadUrl(
                documentFile,
            );
        } catch (error) {
            this.removePhysicalFile(
                promoted.absolutePath,
            );

            throw error;
        }
    }


    async uploadCustomerCorrectiveActionEvidence(
        actionId: string,
        dto: UploadCustomerCorrectiveActionEvidenceDto,
        file: Express.Multer.File,
        uploadedBy: string | undefined,
        actor: ResourceActor,
    ) {
        if (!file) {
            throw new BadRequestException(
                'Chưa chọn file tải lên',
            );
        }

        const entityRef = {
            entity_type: 'corrective_action',
            entity_id: actionId,
        };

        // Fail early before file validation/promotion. Ownership is resolved
        // from the CAP -> finding -> report -> plan -> project -> customer chain.
        await this.resourceAccess.assertCustomerEntityAccess(
            entityRef,
            actor,
        );

        const validated = validateUploadedFile(
            file,
            'attachment',
        );

        const promoted = promoteValidatedUpload(
            file,
            validated.extension,
        );

        const execute = () =>
            this.prisma.$transaction(
                async (tx) => {
                    // Re-check inside the write transaction so a revoked
                    // customer mapping cannot be used after the pre-check.
                    await this.resourceAccess
                        .assertCustomerEntityAccess(
                            entityRef,
                            actor,
                            tx,
                        );

                    const action =
                        await tx.corrective_actions.findUnique({
                            where: {
                                id: actionId,
                            },
                            select: {
                                id: true,
                                status: true,
                                audit_findings: {
                                    select: {
                                        status: true,
                                        corrective_actions: {
                                            orderBy: {
                                                version_no: 'desc',
                                            },
                                            take: 1,
                                            select: {
                                                id: true,
                                            },
                                        },
                                    },
                                },
                            },
                        });

                    const isCurrentSubmittedAction =
                        action?.status
                            .trim()
                            .toLowerCase() === 'submitted' &&
                        action.audit_findings.status
                            .trim()
                            .toLowerCase() === 'response_submitted' &&
                        action.audit_findings
                            .corrective_actions[0]?.id === actionId;

                    if (!isCurrentSubmittedAction) {
                        throw new ConflictException(
                            'Chỉ được tải bằng chứng cho phiên bản CAP hiện hành đang chờ xem xét',
                        );
                    }

                    const latestVersion =
                        await tx.documentFile.aggregate({
                            where: {
                                entity_type:
                                    'corrective_action',
                                entity_id:
                                    actionId,
                                document_type:
                                    'corrective_action_evidence',
                                file_kind:
                                    'attachment',
                            },
                            _max: {
                                version_no:
                                    true,
                            },
                        });

                    const nextVersion =
                        (latestVersion._max.version_no ?? 0) + 1;

                    await tx.documentFile.updateMany({
                        where: {
                            entity_type:
                                'corrective_action',
                            entity_id:
                                actionId,
                            document_type:
                                'corrective_action_evidence',
                            file_kind:
                                'attachment',
                            is_current:
                                true,
                        },
                        data: {
                            is_current:
                                false,
                        },
                    });

                    return tx.documentFile.create({
                        data: {
                            entity_type:
                                'corrective_action',
                            entity_id:
                                actionId,
                            document_type:
                                'corrective_action_evidence',
                            file_kind:
                                'attachment',
                            original_name:
                                validated.originalName,
                            stored_name:
                                promoted.storedName,
                            file_url:
                                `/uploads/documents/${promoted.storedName}`,
                            mime_type:
                                validated.mimeType,
                            file_size:
                                validated.fileSize,
                            sha256:
                                validated.sha256,
                            version_no:
                                nextVersion,
                            is_current:
                                true,
                            note:
                                dto.note?.trim() ?? null,
                            uploaded_by:
                                uploadedBy ?? null,
                        },
                    });
                },
                {
                    isolationLevel:
                        Prisma
                            .TransactionIsolationLevel
                            .Serializable,
                },
            );

        try {
            let documentFile:
                Awaited<ReturnType<typeof execute>> |
                undefined;

            for (
                let attempt = 1;
                attempt <= 2;
                attempt += 1
            ) {
                try {
                    documentFile = await execute();
                    break;
                } catch (error) {
                    const code =
                        this.getPrismaErrorCode(error);

                    const retryable =
                        code === 'P2034' ||
                        code === 'P2002';

                    if (
                        !retryable ||
                        attempt === 2
                    ) {
                        if (retryable) {
                            throw new ConflictException(
                                'Có thay đổi đồng thời đối với bằng chứng CAP. Vui lòng tải lại và thử lại.',
                            );
                        }

                        throw error;
                    }
                }
            }

            if (!documentFile) {
                throw new ConflictException(
                    'Không thể lưu bằng chứng CAP do xung đột đồng thời',
                );
            }

            return this.withCustomerDownloadUrl({
                id: documentFile.id,
                original_name:
                    documentFile.original_name,
                mime_type:
                    documentFile.mime_type,
                file_size:
                    documentFile.file_size,
                version_no:
                    documentFile.version_no,
                is_current:
                    documentFile.is_current,
                note:
                    documentFile.note,
                created_at:
                    documentFile.created_at,
                updated_at:
                    documentFile.updated_at,
            });
        } catch (error) {
            this.removePhysicalFile(
                promoted.absolutePath,
            );

            throw error;
        }
    }


    async registerGenerated(
        input: RegisterGeneratedDocumentInput,
    ) {
        if (!existsSync(input.absolute_path)) {
            throw new BadRequestException(
                'Không tìm thấy tệp vừa sinh để đăng ký vào hồ sơ',
            );
        }

        const validated = validateGeneratedDocument(
            input.absolute_path,
            input.original_name,
            input.mime_type,
        );

        const entityType = input.entity_type.trim();
        const documentType = input.document_type.trim();

        try {
            const documentFile =
                await this.prisma.$transaction(
                    async (tx) => {
                        const latestVersion =
                            await tx.documentFile.aggregate({
                                where: {
                                    entity_type: entityType,
                                    entity_id: input.entity_id,
                                    document_type: documentType,
                                    file_kind: input.file_kind,
                                },
                                _max: {
                                    version_no: true,
                                },
                            });

                        const nextVersion =
                            (latestVersion._max.version_no ?? 0) + 1;

                        await tx.documentFile.updateMany({
                            where: {
                                entity_type: entityType,
                                entity_id: input.entity_id,
                                document_type: documentType,
                                file_kind: input.file_kind,
                                is_current: true,
                            },
                            data: {
                                is_current: false,
                            },
                        });

                        return tx.documentFile.create({
                            data: {
                                entity_type: entityType,
                                entity_id: input.entity_id,
                                document_type: documentType,
                                file_kind: input.file_kind,
                                original_name: validated.originalName,
                                stored_name: input.stored_name,
                                file_url: `/uploads/documents/${input.stored_name}`,
                                mime_type: validated.mimeType,
                                file_size: validated.fileSize,
                                sha256: validated.sha256,
                                version_no: nextVersion,
                                is_current: true,
                                note: input.note?.trim() || null,
                                uploaded_by: input.uploaded_by ?? null,
                            },
                        });
                    },
                );

            return this.withDownloadUrl(documentFile);
        } catch (error) {
            this.removePhysicalFile(input.absolute_path);
            throw error;
        }
    }

    async findByEntity(
        entityType: string,
        entityId: string,
        documentType?: string,
        actor?: ResourceActor,
    ) {
        if (actor) {
            await this.resourceAccess.assertDocumentEntityAccess(
                {
                    entity_type: entityType,
                    entity_id: entityId,
                },
                actor,
            );
        }

        const documentFiles =
            await this.prisma.documentFile.findMany(
            {
                where: {
                    entity_type:
                        entityType,

                    entity_id:
                        entityId,

                    ...(documentType
                        ? {
                            document_type:
                                documentType,
                        }
                        : {}),
                },

                orderBy: [
                    {
                        document_type:
                            'asc',
                    },
                    {
                        file_kind:
                            'asc',
                    },
                    {
                        version_no:
                            'desc',
                    },
                ],
            },
            );

        return documentFiles.map(
            (documentFile) =>
                this.withDownloadUrl(
                    documentFile,
                ),
        );
    }

    async findCurrent(
        entityType: string,
        entityId: string,
        actor?: ResourceActor,
    ) {
        if (actor) {
            await this.resourceAccess.assertDocumentEntityAccess(
                {
                    entity_type: entityType,
                    entity_id: entityId,
                },
                actor,
            );
        }

        const documentFiles =
            await this.prisma.documentFile.findMany(
            {
                where: {
                    entity_type:
                        entityType,

                    entity_id:
                        entityId,

                    is_current:
                        true,
                },

                orderBy: {
                    created_at:
                        'desc',
                },
            },
            );

        return documentFiles.map(
            (documentFile) =>
                this.withDownloadUrl(
                    documentFile,
                ),
        );
    }

    async findOne(
        id: string,
        actor?: ResourceActor,
    ) {
        const documentFile =
            await this.prisma.documentFile.findUnique(
                {
                    where: {
                        id,
                    },
                },
            );

        if (!documentFile) {
            throw new NotFoundException(
                'Không tìm thấy file hồ sơ',
            );
        }

        if (actor) {
            const handled = await this.assertControlledLibraryFileAccess(
                documentFile.entity_type,
                documentFile.entity_id,
                actor,
            );
            if (!handled) {
                await this.resourceAccess.assertDocumentEntityAccess(
                    documentFile,
                    actor,
                );
            }
        }

        return this.withDownloadUrl(
            documentFile,
        );
    }

    private async assertCustomerOrganizationChangeRequestAccess(
        requestId: string,
        actor: ResourceActor,
    ) {
        const customerIds = Array.from(
            await this.resourceAccess.getAccessibleCustomerIds(actor),
        );
        if (!customerIds.length) {
            throw new ForbiddenException(
                'Bạn không có quyền truy cập yêu cầu thay đổi này',
            );
        }

        const request = await this.prisma.customer_organization_change_requests.findFirst({
            where: {
                id: requestId,
                customer_id: { in: customerIds },
            },
            select: {
                id: true,
                status: true,
                customer_id: true,
            },
        });
        if (!request) {
            throw new ForbiddenException(
                'Bạn không có quyền truy cập yêu cầu thay đổi này',
            );
        }
        return request;
    }

    async uploadCustomerOrganizationChangeAttachment(
        requestId: string,
        dto: UploadCustomerOrganizationChangeAttachmentDto,
        file: Express.Multer.File,
        uploadedBy: string | undefined,
        actor: ResourceActor,
    ) {
        if (!file) {
            throw new BadRequestException('Chưa chọn file tải lên');
        }

        const request = await this.assertCustomerOrganizationChangeRequestAccess(
            requestId,
            actor,
        );
        if (!['SUBMITTED', 'UNDER_REVIEW'].includes(request.status)) {
            throw new ConflictException(
                'Chỉ được bổ sung tệp khi yêu cầu thay đổi đang chờ xem xét',
            );
        }

        const validated = validateUploadedFile(file, 'attachment');
        const promoted = promoteValidatedUpload(file, validated.extension);

        try {
            const documentFile = await this.prisma.$transaction(async (tx) => {
                const accessibleCustomerIds = Array.from(
                    await this.resourceAccess.getAccessibleCustomerIds(actor, tx),
                );
                const currentRequest = await tx.customer_organization_change_requests.findFirst({
                    where: {
                        id: requestId,
                        customer_id: { in: accessibleCustomerIds },
                        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
                    },
                    select: { id: true },
                });
                if (!currentRequest) {
                    throw new ForbiddenException(
                        'Bạn không có quyền bổ sung tệp cho yêu cầu thay đổi này',
                    );
                }

                const latest = await tx.documentFile.aggregate({
                    where: {
                        entity_type: 'customer_organization_change_request',
                        entity_id: requestId,
                        document_type: 'organization_change_attachment',
                        file_kind: 'attachment',
                    },
                    _max: { version_no: true },
                });
                const nextVersion = (latest._max.version_no ?? 0) + 1;

                return tx.documentFile.create({
                    data: {
                        entity_type: 'customer_organization_change_request',
                        entity_id: requestId,
                        document_type: 'organization_change_attachment',
                        file_kind: 'attachment',
                        original_name: validated.originalName,
                        stored_name: promoted.storedName,
                        file_url: `/uploads/documents/${promoted.storedName}`,
                        mime_type: validated.mimeType,
                        file_size: validated.fileSize,
                        sha256: validated.sha256,
                        version_no: nextVersion,
                        is_current: true,
                        note: dto.note?.trim() ?? null,
                        uploaded_by: uploadedBy ?? null,
                    },
                });
            });

            return this.withCustomerDownloadUrl(documentFile);
        } catch (error) {
            this.removePhysicalFile(promoted.absolutePath);
            throw error;
        }
    }

    async uploadCustomerCaseEvidence(
        caseTypeInput: string,
        caseId: string,
        dto: UploadCustomerOrganizationChangeAttachmentDto,
        file: Express.Multer.File,
        uploadedBy: string | undefined,
        actor: ResourceActor,
    ) {
        if (!file) throw new BadRequestException('Chưa chọn file tải lên');
        const caseType = caseTypeInput.trim().toLowerCase();
        const entityType = caseType === 'complaint'
            ? 'complaint_case'
            : caseType === 'appeal'
                ? 'appeal_case'
                : null;
        if (!entityType) throw new BadRequestException('caseType chỉ nhận complaint hoặc appeal');

        await this.resourceAccess.assertCustomerEntityAccess(
            { entity_type: entityType, entity_id: caseId },
            actor,
        );
        const validated = validateUploadedFile(file, 'attachment');
        const promoted = promoteValidatedUpload(file, validated.extension);

        try {
            const documentFile = await this.prisma.$transaction(async (tx) => {
                await this.resourceAccess.assertCustomerEntityAccess(
                    { entity_type: entityType, entity_id: caseId },
                    actor,
                    tx,
                );
                const open = caseType === 'complaint'
                    ? await tx.complaint_cases.findFirst({
                        where: { id: caseId, status: { notIn: ['CLOSED', 'REJECTED', 'OUT_OF_SCOPE'] } },
                        select: { id: true },
                    })
                    : await tx.appeal_cases.findFirst({
                        where: { id: caseId, status: { notIn: ['CLOSED', 'REJECTED', 'OUT_OF_SCOPE'] } },
                        select: { id: true },
                    });
                if (!open) throw new ConflictException('Không thể bổ sung evidence vào case đã đóng');

                const latest = await tx.documentFile.aggregate({
                    where: {
                        entity_type: entityType,
                        entity_id: caseId,
                        document_type: 'case_evidence',
                        file_kind: 'attachment',
                    },
                    _max: { version_no: true },
                });
                const documentFile = await tx.documentFile.create({
                    data: {
                        entity_type: entityType,
                        entity_id: caseId,
                        document_type: 'case_evidence',
                        file_kind: 'attachment',
                        original_name: validated.originalName,
                        stored_name: promoted.storedName,
                        file_url: `/uploads/documents/${promoted.storedName}`,
                        mime_type: validated.mimeType,
                        file_size: validated.fileSize,
                        sha256: validated.sha256,
                        version_no: (latest._max.version_no ?? 0) + 1,
                        is_current: true,
                        note: dto.note?.trim() ?? null,
                        uploaded_by: uploadedBy ?? null,
                    },
                });
                await tx.audit_logs.create({
                    data: {
                        user_id: uploadedBy ?? actor.userId ?? null,
                        action: 'CASE_EVIDENCE_UPLOAD',
                        entity_type: entityType,
                        entity_id: caseId,
                        outcome: 'SUCCESS',
                    },
                });
                return documentFile;
            }, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            });
            return this.withCustomerDownloadUrl(documentFile);
        } catch (error) {
            this.removePhysicalFile(promoted.absolutePath);
            throw error;
        }
    }

    async getCustomerPortalDownload(
        id: string,
        actor: ResourceActor,
    ) {
        const documentFile = await this.prisma.documentFile.findUnique({
            where: { id },
        });
        if (!documentFile) {
            throw new ForbiddenException('Bạn không có quyền truy cập tệp này');
        }

        const entityType = documentFile.entity_type.trim().toLowerCase();
        const documentType = documentFile.document_type.trim().toLowerCase();
        const fileKind = documentFile.file_kind.trim().toLowerCase();

        if (
            entityType === 'corrective_action' &&
            documentType === 'corrective_action_evidence' &&
            fileKind === 'attachment'
        ) {
            await this.resourceAccess.assertCustomerEntityAccess(
                { entity_type: 'corrective_action', entity_id: documentFile.entity_id },
                actor,
            );
        } else if (
            entityType === 'customer_organization_change_request' &&
            documentType === 'organization_change_attachment' &&
            fileKind === 'attachment'
        ) {
            await this.assertCustomerOrganizationChangeRequestAccess(
                documentFile.entity_id,
                actor,
            );
        } else if (
            ['complaint_case', 'appeal_case'].includes(entityType) &&
            documentType === 'case_evidence' &&
            fileKind === 'attachment'
        ) {
            await this.resourceAccess.assertCustomerEntityAccess(
                { entity_type: entityType, entity_id: documentFile.entity_id },
                actor,
            );
        } else {
            throw new ForbiddenException('Bạn không có quyền truy cập tệp này');
        }

        let absolutePath: string;
        try {
            absolutePath = resolveDocumentStoragePath(documentFile.stored_name);
        } catch {
            throw new NotFoundException('Không tìm thấy tệp vật lý');
        }
        if (!existsSync(absolutePath)) {
            throw new NotFoundException('Không tìm thấy tệp vật lý');
        }

        verifyStoredFileIntegrity(
            absolutePath,
            documentFile.file_size,
            documentFile.sha256,
        );

        let verifiedDocumentFile = documentFile;
        if (!documentFile.sha256) {
            const sha256 = calculateFileSha256(absolutePath);
            verifiedDocumentFile = await this.prisma.documentFile.update({
                where: { id: documentFile.id },
                data: { sha256 },
            });
        }

        return {
            documentFile: this.withCustomerDownloadUrl({
                id: verifiedDocumentFile.id,
                original_name: verifiedDocumentFile.original_name,
                mime_type: verifiedDocumentFile.mime_type,
                file_size: verifiedDocumentFile.file_size,
                version_no: verifiedDocumentFile.version_no,
                is_current: verifiedDocumentFile.is_current,
                note: verifiedDocumentFile.note,
                created_at: verifiedDocumentFile.created_at,
                updated_at: verifiedDocumentFile.updated_at,
            }),
            absolutePath,
        };
    }

    async getCustomerCorrectiveActionEvidenceDownload(
        id: string,
        actor: ResourceActor,
    ) {
        const documentFile =
            await this.prisma.documentFile.findUnique({
                where: {
                    id,
                },
            });

        const isCorrectiveActionEvidence =
            documentFile?.entity_type
                ?.trim()
                .toLowerCase() ===
                'corrective_action' &&
            documentFile?.document_type
                ?.trim()
                .toLowerCase() ===
                'corrective_action_evidence' &&
            documentFile?.file_kind
                ?.trim()
                .toLowerCase() ===
                'attachment';

        if (
            !documentFile ||
            !isCorrectiveActionEvidence
        ) {
            // Customer routes intentionally use a generic forbidden response
            // so a UUID cannot be used to enumerate unrelated documents.
            throw new ForbiddenException(
                'Bạn không có quyền truy cập tệp này',
            );
        }

        await this.resourceAccess
            .assertCustomerEntityAccess(
                {
                    entity_type:
                        'corrective_action',
                    entity_id:
                        documentFile.entity_id,
                },
                actor,
            );

        let absolutePath: string;

        try {
            absolutePath =
                resolveDocumentStoragePath(
                    documentFile.stored_name,
                );
        } catch {
            throw new NotFoundException(
                'Không tìm thấy tệp vật lý',
            );
        }

        if (!existsSync(absolutePath)) {
            throw new NotFoundException(
                'Không tìm thấy tệp vật lý',
            );
        }

        verifyStoredFileIntegrity(
            absolutePath,
            documentFile.file_size,
            documentFile.sha256,
        );

        let verifiedDocumentFile = documentFile;

        if (!documentFile.sha256) {
            const sha256 =
                calculateFileSha256(
                    absolutePath,
                );

            verifiedDocumentFile =
                await this.prisma.documentFile.update({
                    where: {
                        id:
                            documentFile.id,
                    },
                    data: {
                        sha256,
                    },
                });
        }

        return {
            documentFile:
                this.withCustomerDownloadUrl({
                    id:
                        verifiedDocumentFile.id,
                    original_name:
                        verifiedDocumentFile.original_name,
                    mime_type:
                        verifiedDocumentFile.mime_type,
                    file_size:
                        verifiedDocumentFile.file_size,
                    version_no:
                        verifiedDocumentFile.version_no,
                    is_current:
                        verifiedDocumentFile.is_current,
                    note:
                        verifiedDocumentFile.note,
                    created_at:
                        verifiedDocumentFile.created_at,
                    updated_at:
                        verifiedDocumentFile.updated_at,
                }),
            absolutePath,
        };
    }

    async getDownload(
        id: string,
        actor?: ResourceActor,
    ) {
        const documentFile =
            await this.findOne(
                id,
                actor,
            );

        let absolutePath: string;

        try {
            absolutePath =
                resolveDocumentStoragePath(
                    documentFile.stored_name,
                );
        } catch {
            throw new NotFoundException(
                'Không tìm thấy tệp vật lý',
            );
        }

        if (
            !existsSync(
                absolutePath,
            )
        ) {
            throw new NotFoundException(
                'Không tìm thấy tệp vật lý',
            );
        }

        verifyStoredFileIntegrity(
            absolutePath,
            documentFile.file_size,
            documentFile.sha256,
        );

        // Hồ sơ tạo trước Patch 36B.5 chưa có checksum. Sau khi dung lượng
        // vẫn khớp metadata cũ, neo SHA-256 tại lần đọc đầu tiên để các lần
        // sau phát hiện được mọi thay đổi vật lý của tệp.
        let verifiedDocumentFile = documentFile;
        if (!documentFile.sha256) {
            const sha256 = calculateFileSha256(absolutePath);
            const updated = await this.prisma.documentFile.update({
                where: { id: documentFile.id },
                data: { sha256 },
            });
            verifiedDocumentFile = this.withDownloadUrl(updated);
        }

        return {
            documentFile: verifiedDocumentFile,
            absolutePath,
        };
    }
}

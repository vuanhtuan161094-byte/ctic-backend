import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';


import {
    existsSync,
    unlinkSync,
} from 'fs';

import { PrismaService } from '../prisma/prisma.service';
import { ResourceAccessService, ResourceActor } from '../security/resource-access.service';
import { resolveDocumentStoragePath } from '../common/storage-config';
import { calculateFileSha256 } from '../common/file-integrity';
import {
    promoteValidatedUpload,
    validateGeneratedDocument,
    validateUploadedFile,
    verifyStoredFileIntegrity,
} from '../common/upload-security';

import { UploadDocumentFileDto } from './dto/upload-document-file.dto';

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
    file_kind: 'generated_docx' | 'generated_pdf';
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

        if (actor) {
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
            await this.resourceAccess.assertDocumentEntityAccess(
                documentFile,
                actor,
            );
        }

        return this.withDownloadUrl(
            documentFile,
        );
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

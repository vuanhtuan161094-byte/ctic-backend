import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import {
    basename,
    resolve,
    sep,
} from 'path';

import {
    existsSync,
    unlinkSync,
} from 'fs';

import { PrismaService } from '../prisma/prisma.service';

import { UploadDocumentFileDto } from './dto/upload-document-file.dto';

@Injectable()
export class DocumentFilesService {
    constructor(
        private readonly prisma: PrismaService,
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
    ) {
        if (!file) {
            throw new BadRequestException(
                'Chưa chọn file tải lên',
            );
        }

        const entityType =
            dto.entity_type.trim();

        const documentType =
            dto.document_type.trim();

        try {
            const documentFile =
                await this.prisma.$transaction(
                async (tx) => {
                    const latestVersion =
                        await tx.documentFile.aggregate(
                            {
                                where: {
                                    entity_type:
                                        entityType,

                                    entity_id:
                                        dto.entity_id,

                                    document_type:
                                        documentType,

                                    file_kind:
                                        dto.file_kind,
                                },

                                _max: {
                                    version_no: true,
                                },
                            },
                        );

                    const nextVersion =
                        (
                            latestVersion
                                ._max
                                .version_no ??
                            0
                        ) + 1;

                    await tx.documentFile.updateMany(
                        {
                            where: {
                                entity_type:
                                    entityType,

                                entity_id:
                                    dto.entity_id,

                                document_type:
                                    documentType,

                                file_kind:
                                    dto.file_kind,

                                is_current:
                                    true,
                            },

                            data: {
                                is_current:
                                    false,
                            },
                        },
                    );

                    const fileUrl =
                        `/uploads/documents/${file.filename}`;

                    return tx.documentFile.create(
                        {
                            data: {
                                entity_type:
                                    entityType,

                                entity_id:
                                    dto.entity_id,

                                document_type:
                                    documentType,

                                file_kind:
                                    dto.file_kind,

                                original_name:
                                    file.originalname,

                                stored_name:
                                    file.filename,

                                file_url:
                                    fileUrl,

                                mime_type:
                                    file.mimetype,

                                file_size:
                                    file.size,

                                version_no:
                                    nextVersion,

                                is_current:
                                    true,

                                note:
                                    dto.note?.trim() ??
                                    null,

                                uploaded_by:
                                    uploadedBy ??
                                    null,
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
                file.path,
            );

            throw error;
        }
    }

    async findByEntity(
        entityType: string,
        entityId: string,
        documentType?: string,
    ) {
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
    ) {
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

    async findOne(id: string) {
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

        return this.withDownloadUrl(
            documentFile,
        );
    }

    async getDownload(id: string) {
        const documentFile =
            await this.findOne(id);

        const documentsDirectory =
            resolve(
                process.cwd(),
                'uploads',
                'documents',
            );

        const safeStoredName =
            basename(
                documentFile.stored_name,
            );

        const absolutePath =
            resolve(
                documentsDirectory,
                safeStoredName,
            );

        if (
            safeStoredName !==
                documentFile.stored_name ||
            !absolutePath.startsWith(
                `${documentsDirectory}${sep}`,
            ) ||
            !existsSync(
                absolutePath,
            )
        ) {
            throw new NotFoundException(
                'Không tìm thấy tệp vật lý',
            );
        }

        return {
            documentFile,
            absolutePath,
        };
    }
}

import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';

import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { DocumentFilesService } from './document-files.service';
import { UploadDocumentFileDto } from './dto/upload-document-file.dto';

const uploadDirectory =
    join(
        process.cwd(),
        'uploads',
        'documents',
    );

mkdirSync(
    uploadDirectory,
    {
        recursive: true,
    },
);

interface AuthenticatedRequest {
    user?: {
        id?: string;
        userId?: string;
        sub?: string;
    };
}

@Controller('document-files')
@ApiTags('14. Tệp hồ sơ và phiên bản')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class DocumentFilesController {
    constructor(
        private readonly documentFilesService:
            DocumentFilesService,
    ) { }

    @Post('upload')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
    )
    @Permissions('documents.manage')
    @ApiOperation({
        summary: 'Tải tệp hồ sơ lên hệ thống',
        description:
            'Chấp nhận PDF, Word, JPG hoặc PNG tối đa 20 MB; tự tăng phiên bản và chuyển bản cũ khỏi trạng thái current.',
    })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: [
                'file',
                'entity_type',
                'entity_id',
                'document_type',
                'file_kind',
            ],
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'Tệp PDF, Word, JPG hoặc PNG',
                },
                entity_type: {
                    type: 'string',
                    example: 'technical_review',
                },
                entity_id: {
                    type: 'string',
                    format: 'uuid',
                    example: 'f842c677-f9ac-4ec3-972c-58ccf5e3d13e',
                },
                document_type: {
                    type: 'string',
                    example: 'audit_checklist',
                },
                file_kind: {
                    type: 'string',
                    enum: [
                        'generated_docx',
                        'generated_pdf',
                        'signed_scan',
                        'attachment',
                    ],
                    example: 'attachment',
                },
                note: {
                    type: 'string',
                    example: 'Checklist đánh giá phiên bản mới nhất.',
                },
            },
        },
    })
    @ApiCreatedResponse({
        description: 'Tải tệp và tạo phiên bản thành công',
    })
    @ApiBadRequestResponse({
        description: 'Thiếu tệp, sai định dạng hoặc dung lượng vượt quá 20 MB',
    })
    @UseInterceptors(
        FileInterceptor(
            'file',
            {
                storage: diskStorage({
                    destination:
                        uploadDirectory,

                    filename: (
                        _request,
                        file,
                        callback,
                    ) => {
                        const extension =
                            extname(
                                file.originalname,
                            ).toLowerCase();

                        const storedName =
                            `${randomUUID()}${extension}`;

                        callback(
                            null,
                            storedName,
                        );
                    },
                }),

                limits: {
                    fileSize:
                        20 *
                        1024 *
                        1024,
                },

                fileFilter: (
                    _request,
                    file,
                    callback,
                ) => {
                    const allowedMimeTypes =
                        [
                            'application/pdf',
                            'application/msword',
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                            'image/jpeg',
                            'image/png',
                        ];

                    if (
                        !allowedMimeTypes.includes(
                            file.mimetype,
                        )
                    ) {
                        return callback(
                            new BadRequestException(
                                'Chỉ chấp nhận PDF, Word, JPG hoặc PNG',
                            ),
                            false,
                        );
                    }

                    callback(
                        null,
                        true,
                    );
                },
            },
        ),
    )
    upload(
        @Body()
        dto: UploadDocumentFileDto,

        @UploadedFile()
        file: Express.Multer.File,

        @Req()
        request: AuthenticatedRequest,
    ) {
        const uploadedBy =
            request.user?.id ??
            request.user?.userId ??
            request.user?.sub;

        return this.documentFilesService.upload(
            dto,
            file,
            uploadedBy,
        );
    }

    @Get('entity/:entityType/:entityId/current')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('documents.read')
    @ApiOperation({
        summary: 'Lấy các phiên bản hiện hành của một đối tượng',
    })
    @ApiParam({
        name: 'entityType',
        example: 'technical_review',
        description: 'Loại đối tượng nghiệp vụ',
    })
    @ApiParam({
        name: 'entityId',
        description: 'UUID đối tượng nghiệp vụ',
    })
    @ApiOkResponse({
        description: 'Danh sách tài liệu hiện hành',
    })
    findCurrent(
        @Param('entityType')
        entityType: string,

        @Param(
            'entityId',
            ParseUUIDPipe,
        )
        entityId: string,
    ) {
        return this.documentFilesService.findCurrent(
            entityType,
            entityId,
        );
    }

    @Get('entity/:entityType/:entityId')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('documents.read')
    @ApiOperation({
        summary: 'Lấy toàn bộ lịch sử tệp của một đối tượng',
    })
    @ApiParam({
        name: 'entityType',
        example: 'technical_review',
        description: 'Loại đối tượng nghiệp vụ',
    })
    @ApiParam({
        name: 'entityId',
        description: 'UUID đối tượng nghiệp vụ',
    })
    @ApiQuery({
        name: 'document_type',
        required: false,
        example: 'audit_checklist',
        description: 'Lọc theo loại tài liệu',
    })
    @ApiOkResponse({
        description: 'Danh sách các phiên bản tệp',
    })
    findByEntity(
        @Param('entityType')
        entityType: string,

        @Param(
            'entityId',
            ParseUUIDPipe,
        )
        entityId: string,

        @Query('document_type')
        documentType?: string,
    ) {
        return this.documentFilesService.findByEntity(
            entityType,
            entityId,
            documentType,
        );
    }

    @Get(':id/download')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('documents.read')
    @ApiOperation({
        summary: 'Mở hoặc tải tệp hồ sơ có kiểm soát quyền truy cập',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID bản ghi tệp',
    })
    @ApiOkResponse({
        description: 'Nội dung tệp',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy bản ghi hoặc tệp vật lý',
    })
    async download(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Res()
        response: Response,
    ) {
        const result =
            await this.documentFilesService.getDownload(
                id,
            );

        response.type(
            result.documentFile.mime_type,
        );

        response.setHeader(
            'Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(
                result.documentFile.original_name,
            )}`,
        );

        return response.sendFile(
            result.absolutePath,
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('documents.read')
    @ApiOperation({
        summary: 'Lấy thông tin một phiên bản tệp',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID bản ghi tệp',
        example: 'f15eb60c-6647-41c0-8f59-a1bc0eb3c704',
    })
    @ApiOkResponse({
        description: 'Thông tin và đường dẫn tệp',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy tệp',
    })
    findOne(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ) {
        return this.documentFilesService.findOne(id);
    }
}

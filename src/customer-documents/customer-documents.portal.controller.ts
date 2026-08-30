import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Req,
    Res,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBearerAuth,
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getResourceActor } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import {
    createSecureUploadOptions,
    TempUploadCleanupInterceptor,
} from '../common/upload-security';
import { CustomerDocumentsService } from './customer-documents.service';
import { SubmitCustomerDocumentResponseDto } from './dto/submit-customer-document-response.dto';
import { UploadCustomerApplicationDocumentDto } from './dto/upload-customer-application-document.dto';
import { UploadCustomerDocumentResponseDto } from './dto/upload-customer-document-response.dto';

@Controller('customer-portal/me/documents')
@ApiTags('27. Tài liệu cổng khách hàng')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('CUSTOMER')
@Permissions('customer_portal.access')
export class CustomerDocumentsPortalController {
    constructor(private readonly service: CustomerDocumentsService) {}

    @Get()
    @ApiOperation({ summary: 'Danh sách tài liệu đơn đăng ký và yêu cầu bổ sung tài liệu' })
    list(@Req() request: SecurityRequest) {
        return this.service.getPortalDocuments(getResourceActor(request));
    }

    @Post('applications/:applicationId/upload')
    @ApiOperation({ summary: 'Khách hàng tải tài liệu kèm đơn đăng ký qua pipeline bảo mật' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file', 'category'],
            properties: {
                file: { type: 'string', format: 'binary' },
                category: {
                    type: 'string',
                    enum: ['LEGAL', 'MANAGEMENT_SYSTEM', 'SCOPE_SITE', 'EMPLOYEE', 'OTHER'],
                },
                note: { type: 'string', maxLength: 1000 },
            },
        },
    })
    @UseInterceptors(
        FileInterceptor('file', createSecureUploadOptions()),
        new TempUploadCleanupInterceptor(),
    )
    uploadApplicationDocument(
        @Param('applicationId', new ParseUUIDPipe({ version: '4' })) applicationId: string,
        @Body() dto: UploadCustomerApplicationDocumentDto,
        @UploadedFile() file: Express.Multer.File,
        @Req() request: SecurityRequest,
    ) {
        return this.service.uploadApplicationDocument(
            applicationId,
            dto,
            file,
            getResourceActor(request),
        );
    }

    @Post('requests/:requestId/upload')
    @ApiOperation({ summary: 'Khách hàng tải tài liệu phản hồi yêu cầu bổ sung' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: { type: 'string', format: 'binary' },
                note: { type: 'string', maxLength: 1000 },
            },
        },
    })
    @UseInterceptors(
        FileInterceptor('file', createSecureUploadOptions()),
        new TempUploadCleanupInterceptor(),
    )
    uploadResponse(
        @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
        @Body() dto: UploadCustomerDocumentResponseDto,
        @UploadedFile() file: Express.Multer.File,
        @Req() request: SecurityRequest,
    ) {
        return this.service.uploadDocumentRequestResponse(
            requestId,
            dto,
            file,
            getResourceActor(request),
        );
    }

    @Post('requests/:requestId/submit')
    @ApiOperation({ summary: 'Gửi phản hồi tài liệu tới điều phối viên' })
    submitResponse(
        @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
        @Body() dto: SubmitCustomerDocumentResponseDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.submitResponse(requestId, dto, getResourceActor(request));
    }

    @Get('files/:fileId/download')
    @ApiOperation({ summary: 'Mở hoặc tải tệp customer-safe thuộc tổ chức hiện tại' })
    async download(
        @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
        @Req() request: SecurityRequest,
        @Res() response: Response,
    ) {
        const result = await this.service.getPortalDownload(fileId, getResourceActor(request));
        response.type(result.documentFile.mime_type);
        response.setHeader(
            'Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(result.documentFile.original_name)}`,
        );
        return response.sendFile(result.absolutePath);
    }
}

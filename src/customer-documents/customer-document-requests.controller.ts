import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    UnauthorizedException,
    Res,
    UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
    ApiBearerAuth,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getActorUserId } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import { CustomerDocumentsService } from './customer-documents.service';
import { CreateCustomerDocumentRequestDto } from './dto/create-customer-document-request.dto';
import { ReviewCustomerDocumentRequestDto } from './dto/review-customer-document-request.dto';

@Controller('customer-document-requests')
@ApiTags('28. Yêu cầu tài liệu khách hàng')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN', 'COORDINATOR')
@Permissions('customer_documents.manage')
export class CustomerDocumentRequestsController {
    constructor(private readonly service: CustomerDocumentsService) {}

    @Get()
    @ApiOperation({ summary: 'Hàng đợi yêu cầu/ phản hồi tài liệu khách hàng' })
    list(@Query('status') status?: string) {
        return this.service.getReviewQueue(status);
    }

    @Post()
    @ApiOperation({ summary: 'Tạo yêu cầu khách hàng bổ sung tài liệu cho đơn đăng ký' })
    create(
        @Body() dto: CreateCustomerDocumentRequestDto,
        @Req() request: SecurityRequest,
    ) {
        const userId = getActorUserId(request);
        if (!userId) throw new UnauthorizedException('Không xác định được tài khoản đang đăng nhập');
        return this.service.createRequest(dto, userId);
    }

    @Post(':requestId/review')
    @ApiOperation({ summary: 'Chấp nhận hoặc yêu cầu bổ sung lại tài liệu khách hàng' })
    review(
        @Param('requestId', new ParseUUIDPipe({ version: '4' })) requestId: string,
        @Body() dto: ReviewCustomerDocumentRequestDto,
        @Req() request: SecurityRequest,
    ) {
        const userId = getActorUserId(request);
        if (!userId) throw new UnauthorizedException('Không xác định được tài khoản đang đăng nhập');
        return this.service.reviewRequest(requestId, dto, userId);
    }

    @Get('files/:fileId/download')
    @ApiOperation({ summary: 'Mở tài liệu phản hồi để xem xét nội bộ' })
    async download(
        @Param('fileId', new ParseUUIDPipe({ version: '4' })) fileId: string,
        @Res() response: Response,
    ) {
        const result = await this.service.getInternalDownload(fileId);
        response.type(result.documentFile.mime_type);
        response.setHeader(
            'Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(result.documentFile.original_name)}`,
        );
        return response.sendFile(result.absolutePath);
    }
}

import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { AuditResultNotificationsService } from './audit-result-notifications.service';
import { CreateAuditResultNotificationDto } from './dto/create-audit-result-notification.dto';
import { MarkNotificationSentDto } from './dto/mark-notification-sent.dto';

interface AuthenticatedRequest {
    user?: {
        id?: string;
        userId?: string;
        sub?: string;
    };
}

@Controller('audit-result-notifications')
@ApiTags('17. Thông báo kết quả đánh giá')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class AuditResultNotificationsController {
    constructor(
        private readonly auditResultNotificationsService:
            AuditResultNotificationsService,
    ) { }

    @Post()
    @Roles(
        'ADMIN',
        'DECISION_MAKER',
    )
    @Permissions('notifications.manage')
    @ApiOperation({
        summary: 'Tạo thông báo kết quả đánh giá F.12-P.09',
        description:
            'F.12 chỉ được lập sau khi F.13/quyết định chứng nhận tương ứng đã được ban hành.',
    })
    @ApiCreatedResponse({
        description: 'Tạo thông báo kết quả thành công',
    })
    @ApiBadRequestResponse({
        description: 'Hồ sơ hoặc quan hệ quyết định không đáp ứng quy tắc nghiệp vụ',
    })
    @ApiConflictResponse({
        description: 'Hồ sơ thẩm xét hoặc số thông báo đã được sử dụng',
    })
    create(
        @Body()
        dto: CreateAuditResultNotificationDto,

        @Req()
        request: AuthenticatedRequest,
    ) {
        const createdBy =
            request.user?.userId ??
            request.user?.id ??
            request.user?.sub;

        return this.auditResultNotificationsService.create(
            dto,
            createdBy,
        );
    }

    @Post(':id/mark-sent')
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'DECISION_MAKER',
    )
    @Permissions('notifications.manage')
    @ApiOperation({
        summary: 'Đánh dấu thông báo đã gửi cho khách hàng',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID thông báo kết quả',
    })
    @ApiOkResponse({
        description: 'Thông báo chuyển sang trạng thái sent',
    })
    markAsSent(
        @Param('id')
        id: string,

        @Body()
        dto: MarkNotificationSentDto,
    ) {
        return this.auditResultNotificationsService
            .markAsSent(
                id,
                dto,
            );
    }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'DECISION_MAKER',
    )
    @Permissions('notifications.read')
    @ApiOperation({
        summary: 'Lấy danh sách thông báo kết quả đánh giá',
    })
    @ApiOkResponse({
        description: 'Danh sách thông báo kết quả',
    })
    findAll() {
        return this.auditResultNotificationsService.findAll();
    }

    @Get('technical-review/:technicalReviewId')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'DECISION_MAKER',
    )
    @Permissions('notifications.read')
    @ApiOperation({
        summary: 'Lấy thông báo theo hồ sơ thẩm xét',
    })
    @ApiParam({
        name: 'technicalReviewId',
        description: 'UUID hồ sơ thẩm xét kỹ thuật',
        example: 'f842c677-f9ac-4ec3-972c-58ccf5e3d13e',
    })
    @ApiOkResponse({
        description: 'Thông báo kết quả của hồ sơ thẩm xét',
    })
    findByTechnicalReview(
        @Param('technicalReviewId')
        technicalReviewId: string,
    ) {
        return this.auditResultNotificationsService
            .findByTechnicalReview(
                technicalReviewId,
            );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'DECISION_MAKER',
    )
    @Permissions('notifications.read')
    @ApiOperation({
        summary: 'Lấy chi tiết thông báo kết quả',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID thông báo kết quả',
        example: 'c9c7f4ed-6311-4b2f-a31c-3a1b8aaba695',
    })
    @ApiOkResponse({
        description: 'Chi tiết thông báo, quyết định và hồ sơ thẩm xét',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy thông báo',
    })
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.auditResultNotificationsService.findOne(
            id,
        );
    }
}

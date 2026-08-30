import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';

import type {
    Request,
} from 'express';

import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { NotificationsService } from './notifications.service';

interface AuthenticatedUser {
    userId: string;
    username: string;
    roles: string[];
    permissions?: string[];
}

type AuthenticatedRequest =
    Request & {
        user: AuthenticatedUser;
    };

const INTERNAL_ROLES = [
    'ADMIN',
    'STAFF',
    'SALES',
    'COORDINATOR',
    'LEAD_AUDITOR',
    'AUDITOR',
    'TECHNICAL_EXPERT',
    'TECHNICAL_REVIEWER',
    'DECISION_MAKER',
    'CUSTOMER',
];

@Controller('notifications')
@ApiTags('25. Thông báo nội bộ')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class NotificationsController {
    constructor(
        private readonly notificationsService:
            NotificationsService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Tạo thông báo cho một người dùng' })
    @ApiCreatedResponse({ description: 'Đã tạo thông báo' })
    @ApiBadRequestResponse({ description: 'Dữ liệu thông báo không hợp lệ' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'DECISION_MAKER',
    )
    @Permissions('notifications.manage')
    create(
        @Body()
        dto: CreateNotificationDto,
    ): Promise<unknown> {
        return this.notificationsService.create(dto);
    }

    @Post('actions/generate-reminders')
    @ApiOperation({ summary: 'Đồng bộ cảnh báo nghiệp vụ thành thông báo nội bộ' })
    @ApiQuery({
        name: 'warning_days',
        required: false,
        type: Number,
        minimum: 1,
        maximum: 365,
        example: 90,
    })
    @ApiOkResponse({ description: 'Kết quả tạo, cập nhật và đóng thông báo' })
    @ApiBadRequestResponse({ description: 'Khoảng cảnh báo không hợp lệ' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('notifications.manage')
    generateReminders(
        @Query('warning_days')
        warningDays?: string,
    ): Promise<unknown> {
        return this.notificationsService.generateReminders(
            Number(warningDays ?? 90),
        );
    }

    @Get('me/tasks')
    @ApiOperation({ summary: 'Lấy công việc cần xử lý của tài khoản hiện tại' })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 200 })
    @ApiOkResponse({ description: 'Danh sách công việc theo vai trò và phân công' })
    @Roles(...INTERNAL_ROLES)
    @Permissions('notifications.read')
    getMyTasks(
        @Req()
        request: AuthenticatedRequest,

        @Query('limit')
        limit?: string,
    ): Promise<unknown> {
        return this.notificationsService.findTasksForUser(
            request.user.userId,
            request.user.roles,
            Number(limit ?? 200),
        );
    }

    @Get('me/summary')
    @ApiOperation({ summary: 'Lấy số lượng thông báo chưa đọc của tài khoản hiện tại' })
    @ApiOkResponse({ description: 'Tổng số thông báo theo mức độ' })
    @Roles(...INTERNAL_ROLES)
    @Permissions('notifications.read')
    getMySummary(
        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.notificationsService.getUnreadSummary(
            request.user.userId,
        );
    }

    @Get('me')
    @ApiOperation({ summary: 'Lấy thông báo của tài khoản hiện tại' })
    @ApiQuery({
        name: 'status',
        required: false,
        enum: ['all', 'unread', 'read', 'resolved'],
        example: 'unread',
    })
    @ApiQuery({ name: 'category', required: false, type: String })
    @ApiQuery({
        name: 'severity',
        required: false,
        enum: ['INFO', 'NORMAL', 'WARNING', 'CRITICAL'],
    })
    @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
    @ApiOkResponse({ description: 'Danh sách thông báo của người dùng' })
    @Roles(...INTERNAL_ROLES)
    @Permissions('notifications.read')
    getMine(
        @Req()
        request: AuthenticatedRequest,

        @Query('status')
        status?: string,

        @Query('category')
        category?: string,

        @Query('severity')
        severity?: string,

        @Query('limit')
        limit?: string,
    ): Promise<unknown> {
        return this.notificationsService.findForUser(
            request.user.userId,
            {
                status,
                category,
                severity,
                limit:
                    Number(limit ?? 50),
            },
        );
    }

    @Get('me/preferences')
    @ApiOperation({ summary: 'Lấy lựa chọn nhận thông báo của tài khoản hiện tại' })
    @ApiOkResponse({ description: 'Lựa chọn IN_APP và nền tảng EMAIL tương lai' })
    @Roles(...INTERNAL_ROLES)
    @Permissions('notifications.read')
    getMyPreferences(
        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.notificationsService.getPreferences(
            request.user.userId,
        );
    }

    @Patch('me/preferences/:category')
    @ApiOperation({ summary: 'Cập nhật lựa chọn thông báo trong ứng dụng' })
    @ApiParam({ name: 'category' })
    @ApiOkResponse({ description: 'Lựa chọn đã cập nhật' })
    @Roles(...INTERNAL_ROLES)
    @Permissions('notifications.read')
    updateMyPreference(
        @Param('category')
        category: string,

        @Body()
        dto: UpdateNotificationPreferenceDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.notificationsService.setInAppPreference(
            request.user.userId,
            category,
            dto.enabled,
        );
    }

    @Patch('me/read-all')
    @ApiOperation({ summary: 'Đánh dấu tất cả thông báo là đã đọc' })
    @ApiOkResponse({ description: 'Số thông báo đã cập nhật' })
    @Roles(...INTERNAL_ROLES)
    @Permissions('notifications.read')
    markAllRead(
        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.notificationsService.markAllRead(
            request.user.userId,
        );
    }

    @Patch(':id/read')
    @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Thông báo sau khi cập nhật' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy thông báo của người dùng' })
    @Roles(...INTERNAL_ROLES)
    @Permissions('notifications.read')
    markRead(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.notificationsService.markRead(
            id,
            request.user.userId,
        );
    }
}

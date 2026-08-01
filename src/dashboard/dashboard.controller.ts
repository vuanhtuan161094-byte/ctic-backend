import {
    Controller,
    Get,
    Query,
    UseGuards,
} from '@nestjs/common';

import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@ApiTags('24. Dashboard và cảnh báo')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class DashboardController {
    constructor(
        private readonly dashboardService:
            DashboardService,
    ) { }

    @Get('overview')
    @ApiOperation({ summary: 'Lấy dashboard tổng quan toàn hệ thống' })
    @ApiQuery({
        name: 'warning_days',
        required: false,
        type: Number,
        minimum: 1,
        maximum: 365,
        example: 30,
    })
    @ApiOkResponse({ description: 'Số liệu tổng hợp, tiến độ và cảnh báo ưu tiên' })
    @ApiBadRequestResponse({ description: 'Khoảng cảnh báo không hợp lệ' })
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
    @Permissions('dashboard.read')
    getOverview(
        @Query('warning_days')
        warningDays?: string,
    ) {
        return this.dashboardService.getOverview(
            Number(warningDays ?? 30),
        );
    }

    @Get('alerts')
    @ApiOperation({ summary: 'Lấy toàn bộ cảnh báo nghiệp vụ đang hoạt động' })
    @ApiQuery({
        name: 'warning_days',
        required: false,
        type: Number,
        minimum: 1,
        maximum: 365,
        example: 30,
    })
    @ApiOkResponse({ description: 'Danh sách cảnh báo theo mức độ ưu tiên' })
    @ApiBadRequestResponse({ description: 'Khoảng cảnh báo không hợp lệ' })
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
    @Permissions('dashboard.read')
    getAlerts(
        @Query('warning_days')
        warningDays?: string,
    ) {
        return this.dashboardService.getAlerts(
            Number(warningDays ?? 30),
        );
    }
}

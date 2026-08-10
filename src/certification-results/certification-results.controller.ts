import {
    Controller,
    Get,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiCreatedResponse,
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
import { CertificationResultsService } from './certification-results.service';

interface AuthenticatedRequest {
    user?: { id?: string; userId?: string; sub?: string };
}

@Controller('certification-results')
@ApiTags('18A. Không gian kết quả chứng nhận')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CertificationResultsController {
    constructor(
        private readonly certificationResultsService: CertificationResultsService,
    ) { }

    private getUserId(request: AuthenticatedRequest) {
        return request.user?.id ?? request.user?.userId ?? request.user?.sub;
    }

    @Get('plan/:planId/workspace')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR', 'TECHNICAL_REVIEWER', 'DECISION_MAKER')
    @ApiOperation({ summary: 'Lấy không gian quyết định và thông báo kết quả theo PLAN' })
    @ApiParam({ name: 'planId', description: 'UUID kế hoạch đánh giá' })
    @ApiOkResponse({ description: 'Dữ liệu thẩm xét, quyết định, thông báo và lịch sử F.12/F.13' })
    getWorkspace(@Param('planId') planId: string) {
        return this.certificationResultsService.getWorkspace(planId);
    }

    @Post('decision/:id/generate')
    @Roles('ADMIN', 'DECISION_MAKER')
    @Permissions('certification_decisions.issue')
    @ApiOperation({ summary: 'Sinh quyết định chứng nhận F.13-P.09 Word/PDF' })
    @ApiQuery({ name: 'format', required: true, enum: ['docx', 'pdf'] })
    @ApiCreatedResponse({ description: 'Đã sinh và lưu phiên bản F.13' })
    generateDecision(
        @Param('id') id: string,
        @Query('format') format: string,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.certificationResultsService.generateDecision(
            id,
            format,
            this.getUserId(request),
        );
    }

    @Post('notification/:id/generate')
    @Roles('ADMIN', 'COORDINATOR', 'DECISION_MAKER')
    @Permissions('notifications.manage')
    @ApiOperation({ summary: 'Sinh thông báo kết quả F.12-P.09 Word/PDF' })
    @ApiQuery({ name: 'format', required: true, enum: ['docx', 'pdf'] })
    @ApiCreatedResponse({ description: 'Đã sinh và lưu phiên bản F.12' })
    generateNotification(
        @Param('id') id: string,
        @Query('format') format: string,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.certificationResultsService.generateNotification(
            id,
            format,
            this.getUserId(request),
        );
    }
}

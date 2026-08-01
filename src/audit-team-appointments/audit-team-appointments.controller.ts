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

import type {
    Request,
} from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { AuditTeamAppointmentsService } from './audit-team-appointments.service';
import { CreateAuditTeamAppointmentDto } from './dto/create-audit-team-appointment.dto';
import { UpdateAuditTeamAppointmentDto } from './dto/update-audit-team-appointment.dto';

type AuthenticatedRequest =
    Request & {
        user: {
            userId: string;
            username: string;
            roles: string[];
            permissions?: string[];
        };
    };

@Controller('audit-team-appointments')
@ApiTags('11. Chỉ định đoàn đánh giá')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class AuditTeamAppointmentsController {
    constructor(
        private readonly service:
            AuditTeamAppointmentsService,
    ) { }

    @Post()
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Tạo dự thảo chỉ định đoàn đánh giá F.04',
    })
    @ApiCreatedResponse({
        description: 'Tạo dự thảo chỉ định đoàn thành công',
    })
    @ApiBadRequestResponse({
        description: 'Ngày phân công, thành viên, năng lực hoặc lịch chuyên gia không hợp lệ',
    })
    create(
        @Body()
        dto: CreateAuditTeamAppointmentDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.create(
            dto,
            request.user.userId,
        );
    }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_teams.read')
    @ApiOperation({
        summary: 'Lấy danh sách chỉ định đoàn đánh giá',
    })
    @ApiQuery({
        name: 'plan_id',
        required: false,
        description: 'Lọc theo UUID kế hoạch đánh giá',
    })
    @ApiQuery({
        name: 'project_id',
        required: false,
        description: 'Lọc theo UUID dự án chứng nhận',
    })
    @ApiQuery({
        name: 'status',
        required: false,
        description: 'Lọc theo trạng thái chỉ định',
    })
    @ApiOkResponse({
        description: 'Danh sách chỉ định đoàn đánh giá',
    })
    findAll(
        @Query('plan_id')
        planId?: string,

        @Query('project_id')
        projectId?: string,

        @Query('status')
        status?: string,
    ): Promise<unknown> {
        return this.service.findAll(
            planId,
            projectId,
            status,
        );
    }

    @Get('availability')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_teams.read')
    @ApiOperation({
        summary: 'Kiểm tra chuyên gia có trùng lịch',
    })
    @ApiQuery({
        name: 'expert_id',
        required: true,
        description: 'UUID chuyên gia',
    })
    @ApiQuery({
        name: 'start_date',
        required: true,
        example: '2028-06-01',
        description: 'Ngày bắt đầu cần kiểm tra',
    })
    @ApiQuery({
        name: 'end_date',
        required: true,
        example: '2028-06-01',
        description: 'Ngày kết thúc cần kiểm tra',
    })
    @ApiQuery({
        name: 'exclude_appointment_id',
        required: false,
        description: 'UUID chỉ định cần loại trừ khi cập nhật',
    })
    @ApiOkResponse({
        description: 'Kết quả kiểm tra lịch chuyên gia',
    })
    checkAvailability(
        @Query('expert_id')
        expertId: string,

        @Query('start_date')
        startDate: string,

        @Query('end_date')
        endDate: string,

        @Query('exclude_appointment_id')
        excludeAppointmentId?: string,
    ): Promise<unknown> {
        return this.service.checkAvailability(
            expertId,
            startDate,
            endDate,
            excludeAppointmentId,
        );
    }

    @Get('plan/:planId')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_teams.read')
    @ApiOperation({
        summary: 'Lấy chỉ định đoàn theo kế hoạch',
    })
    @ApiParam({
        name: 'planId',
        description: 'UUID kế hoạch đánh giá',
        example: '93a52fa4-e260-4cdc-9956-5c5f40380a3c',
    })
    @ApiOkResponse({
        description: 'Chỉ định đoàn của kế hoạch',
    })
    findByPlan(
        @Param(
            'planId',
            ParseUUIDPipe,
        )
        planId: string,
    ): Promise<unknown> {
        return this.service.findByPlan(planId);
    }

    @Get('plan/:planId/available-scopes')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_teams.read')
    @ApiOperation({
        summary: 'Lấy phạm vi dự án có thể phân công',
    })
    @ApiParam({
        name: 'planId',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Danh sách phạm vi IAF/NACE của dự án',
    })
    getAvailableProjectScopes(
        @Param(
            'planId',
            ParseUUIDPipe,
        )
        planId: string,
    ): Promise<unknown> {
        return this.service.getAvailableProjectScopes(
            planId,
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_teams.read')
    @ApiOperation({
        summary: 'Lấy chi tiết chỉ định đoàn đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chỉ định đoàn',
        example: 'adbaf143-8923-4156-85b1-849778c5f3e6',
    })
    @ApiOkResponse({
        description: 'Chỉ định, thành viên và phạm vi phân công',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy chỉ định đoàn',
    })
    findOne(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.service.findOne(id);
    }

    @Patch(':id')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Cập nhật dự thảo chỉ định đoàn',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chỉ định đoàn',
    })
    @ApiOkResponse({
        description: 'Cập nhật chỉ định đoàn thành công',
    })
    update(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Body()
        dto: UpdateAuditTeamAppointmentDto,
    ): Promise<unknown> {
        return this.service.update(
            id,
            dto,
        );
    }

    @Post(':id/issue')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Ban hành chỉ định đoàn đánh giá',
        description: 'Xác nhận ban hành bằng tài khoản người dùng hiện tại.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chỉ định đoàn',
    })
    @ApiOkResponse({
        description: 'Chỉ định đoàn đã được ban hành',
    })
    @ApiBadRequestResponse({
        description: 'Đoàn đánh giá chưa đáp ứng điều kiện ban hành',
    })
    issue(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.issue(
            id,
            request.user.userId,
        );
    }

    @Post(':id/check-competency')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_teams.read')
    @ApiOperation({
        summary: 'Kiểm tra năng lực toàn bộ đoàn đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chỉ định đoàn',
    })
    @ApiOkResponse({
        description: 'Kết quả đối chiếu năng lực và phạm vi',
    })
    checkCompetency(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.service.checkCompetency(id);
    }

    @Post(':id/sync-project-scopes')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Đồng bộ phạm vi dự án vào chỉ định đoàn',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chỉ định đoàn',
    })
    @ApiOkResponse({
        description: 'Đã đồng bộ phạm vi dự án',
    })
    syncProjectScopes(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.service.syncProjectScopes(id);
    }

    @Post(':id/cancel')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Hủy chỉ định đoàn đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chỉ định đoàn',
    })
    @ApiOkResponse({
        description: 'Chỉ định đoàn đã được hủy',
    })
    cancel(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.service.cancel(id);
    }
}

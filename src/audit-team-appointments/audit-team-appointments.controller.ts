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
import { ResourceAccessService } from '../security/resource-access.service';
import { getResourceActor } from '../security/security-request';

import { AuditTeamAppointmentsService } from './audit-team-appointments.service';
import { AuditMandayAllocationService } from './audit-manday-allocation.service';
import { CreateAuditTeamAppointmentDto } from './dto/create-audit-team-appointment.dto';
import { UpdateAuditTeamAppointmentDto } from './dto/update-audit-team-appointment.dto';
import {
    AutoMandayAllocationDto,
    ManualMandayAllocationDto,
} from './dto/manday-allocation.dto';

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

        private readonly mandayAllocationService:
            AuditMandayAllocationService,

        private readonly resourceAccess:
            ResourceAccessService,
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
    async findAll(
        @Query('plan_id')
        planId: string | undefined,

        @Query('project_id')
        projectId: string | undefined,

        @Query('status')
        status: string | undefined,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        if (projectId) {
            await this.resourceAccess.assertProjectAccess(
                projectId,
                getResourceActor(request),
            );
        }

        if (planId) {
            await this.resourceAccess.assertEntityAccess(
                { entity_type: 'audit_plan', entity_id: planId },
                getResourceActor(request),
            );
        }

        const appointments =
            await this.service.findAll(
                planId,
                projectId,
                status,
            );

        if (planId || projectId) {
            return appointments;
        }

        const scoped =
            await this.resourceAccess.filterEntities(
                appointments.map((appointment) => ({
                    ...appointment,
                    entity_type: 'audit_team_appointment',
                    entity_id: appointment.id,
                })),
                getResourceActor(request),
            );

        return scoped.map(({
            entity_type: _entityType,
            entity_id: _entityId,
            ...appointment
        }) => appointment);
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


    @Post('project/:projectId/ensure-context')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Khởi tạo ngữ cảnh chỉ định đoàn theo hồ sơ chứng nhận',
    })
    @ApiParam({
        name: 'projectId',
        description: 'UUID hồ sơ chứng nhận',
    })
    @ApiCreatedResponse({
        description: 'Đã sẵn sàng ngữ cảnh chỉ định đoàn cho hồ sơ',
    })
    ensureProjectContext(
        @Param(
            'projectId',
            ParseUUIDPipe,
        )
        projectId: string,
    ): Promise<unknown> {
        return this.service.ensureProjectContext(
            projectId,
        );
    }

    @Get('project/:projectId')
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
        summary: 'Lấy chỉ định đoàn theo mã hồ sơ chứng nhận',
    })
    @ApiParam({
        name: 'projectId',
        description: 'UUID hồ sơ chứng nhận',
    })
    @ApiOkResponse({
        description: 'Chỉ định đoàn cấp hồ sơ chứng nhận',
    })
    async findByProject(
        @Param(
            'projectId',
            ParseUUIDPipe,
        )
        projectId: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertProjectAccess(
            projectId,
            getResourceActor(request),
        );

        return this.service.findByProject(
            projectId,
        );
    }

    @Get('project/:projectId/available-scopes')
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
        summary: 'Lấy phạm vi IAF/NACE đã duyệt theo hồ sơ chứng nhận',
    })
    @ApiParam({
        name: 'projectId',
        description: 'UUID hồ sơ chứng nhận',
    })
    @ApiOkResponse({
        description: 'Danh sách phạm vi có thể phân công cho đoàn',
    })
    async getAvailableProjectScopesByProject(
        @Param(
            'projectId',
            ParseUUIDPipe,
        )
        projectId: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertProjectAccess(
            projectId,
            getResourceActor(request),
        );

        return this.service.getAvailableProjectScopesByProject(
            projectId,
        );
    }

    @Get('project/:projectId/expert-suitability')
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
        summary: 'Đề xuất chuyên gia phù hợp với tiêu chuẩn và phạm vi hồ sơ',
    })
    @ApiParam({
        name: 'projectId',
        description: 'UUID hồ sơ chứng nhận',
    })
    @ApiOkResponse({
        description: 'Ma trận chuyên gia và phạm vi có thể đáp ứng',
    })
    async getProjectExpertSuitability(
        @Param(
            'projectId',
            ParseUUIDPipe,
        )
        projectId: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertProjectAccess(
            projectId,
            getResourceActor(request),
        );

        return this.service.getProjectExpertSuitability(
            projectId,
        );
    }

    @Get('expert/:expertId/busy-dates')
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
        summary: 'Lấy các ngày chuyên gia đã có lịch đánh giá',
    })
    @ApiParam({
        name: 'expertId',
        description: 'UUID chuyên gia',
    })
    @ApiQuery({
        name: 'start_date',
        required: true,
        example: '2026-01-01',
    })
    @ApiQuery({
        name: 'end_date',
        required: true,
        example: '2026-12-31',
    })
    @ApiQuery({
        name: 'exclude_appointment_id',
        required: false,
        description: 'Loại trừ chỉ định đang sửa',
    })
    @ApiOkResponse({
        description: 'Danh sách ngày bận và các kế hoạch liên quan',
    })
    getBusyDates(
        @Param(
            'expertId',
            ParseUUIDPipe,
        )
        expertId: string,

        @Query('start_date')
        startDate: string,

        @Query('end_date')
        endDate: string,

        @Query('exclude_appointment_id')
        excludeAppointmentId?: string,
    ): Promise<unknown> {
        return this.service.getBusyDates(
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
    async findByPlan(
        @Param(
            'planId',
            ParseUUIDPipe,
        )
        planId: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_plan', entity_id: planId },
            getResourceActor(request),
        );

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
    async getAvailableProjectScopes(
        @Param(
            'planId',
            ParseUUIDPipe,
        )
        planId: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_plan', entity_id: planId },
            getResourceActor(request),
        );

        return this.service.getAvailableProjectScopes(
            planId,
        );
    }


    @Get(':id/manday-allocation')
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
        summary: 'Lấy ma trận man-day theo thành viên và chương trình',
    })
    async getMandayAllocation(
        @Param('id', ParseUUIDPipe) id: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_team_appointment', entity_id: id },
            getResourceActor(request),
        );

        return this.mandayAllocationService.getCurrent(id);
    }

    @Post(':id/manday-allocation/auto')
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Tự động phân bổ man-day theo thành viên và chương trình',
    })
    autoAllocateMandays(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AutoMandayAllocationDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.mandayAllocationService.autoAllocate(
            id,
            dto,
            request.user.userId,
        );
    }

    @Patch(':id/manday-allocation/manual')
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Điều chỉnh thủ công ma trận man-day',
    })
    manualOverrideMandays(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ManualMandayAllocationDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.mandayAllocationService.manualOverride(
            id,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/manday-allocation/restore-auto')
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('audit_teams.manage')
    @ApiOperation({
        summary: 'Khôi phục đề xuất tự động gần nhất',
    })
    restoreAutoMandays(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.mandayAllocationService.restoreAutoProposal(
            id,
            request.user.userId,
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
    async findOne(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_team_appointment', entity_id: id },
            getResourceActor(request),
        );

        return this.service.findOne(id);
    }

    @Get(':id/readiness')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_teams.read')
    @ApiOperation({ summary: 'Đánh giá readiness hiện thời của toàn bộ đoàn' })
    @ApiOkResponse({ description: 'Coverage matrix, gates và trạng thái sẵn sàng ban hành' })
    async getReadiness(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_team_appointment', entity_id: id },
            getResourceActor(request),
        );
        return this.service.getReadiness(id);
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

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.update(
            id,
            dto,
            request.user.userId,
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
    async checkCompetency(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_team_appointment', entity_id: id },
            getResourceActor(request),
        );

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

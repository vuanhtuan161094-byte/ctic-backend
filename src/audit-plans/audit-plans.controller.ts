import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
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
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ResourceAccessService } from '../security/resource-access.service';
import { getResourceActor } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import { ActionAuthorizationService } from '../work-items/action-authorization.service';
import { WORK_ITEM_ACTIONS } from '../work-items/work-item.constants';

import { AuditPlansService } from './audit-plans.service';
import { CompleteAuditPlanDto } from './dto/complete-audit-plan.dto';
import { CreateAuditPlanDto } from './dto/create-audit-plan.dto';
import { StartAuditPlanDto } from './dto/start-audit-plan.dto';
import { UpdateAuditPlanDto } from './dto/update-audit-plan.dto';

@Controller('audit-plans')
@ApiTags('10. Kế hoạch đánh giá')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class AuditPlansController {
    constructor(
        private readonly auditPlansService:
            AuditPlansService,
        private readonly resourceAccess:
            ResourceAccessService,
        private readonly actionAuthorization:
            ActionAuthorizationService,
    ) { }

    private getUserId(
        request: {
            user?: {
                id?: string;
                userId?: string;
                sub?: string;
            };
        },
    ): string | undefined {
        return (
            request.user?.id ??
            request.user?.userId ??
            request.user?.sub
        );
    }

    @Post()
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_plans.manage')
    @ApiOperation({
        summary: 'Tạo kế hoạch đánh giá',
        description: 'Tạo kế hoạch cho dự án và sự kiện đánh giá tương ứng.',
    })
    @ApiCreatedResponse({
        description: 'Tạo kế hoạch đánh giá thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu, ngày đánh giá hoặc quan hệ dự án - sự kiện không hợp lệ',
    })
    create(
        @Body()
        dto: CreateAuditPlanDto,
    ) {
        return this.auditPlansService.create(dto);
    }

    @Post(':id/start')
    @Roles(
        'LEAD_AUDITOR',
        'AUDITOR',
    )
    @Permissions('reports.manage')
    @ApiOperation({
        summary: 'Bắt đầu thực hiện cuộc đánh giá',
        description: 'Kiểm tra kế hoạch, quyết định chỉ định đoàn, ngày và man-day trước khi chuyển sang trạng thái đang thực hiện.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Cuộc đánh giá đã được bắt đầu',
    })
    @ApiBadRequestResponse({
        description: 'Kế hoạch hoặc đoàn đánh giá chưa đủ điều kiện',
    })
    async start(
        @Param('id')
        id: string,

        @Body()
        dto: StartAuditPlanDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'audit_plan',
                entity_id: id,
            },
            getResourceActor(request),
        );

        const actor = getResourceActor(request);
        await this.actionAuthorization.assertCanPerformAction({
            user: actor,
            actionCode: WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
            resource: {
                entityType: 'audit_plan',
                entityId: id,
            },
            assignment: {
                assignedUserId: actor.userId,
            },
            workflowState: 'OPEN',
        });

        return this.auditPlansService.start(
            id,
            dto,
            this.getUserId(request),
        );
    }

    @Post(':id/complete')
    @Roles(
        'LEAD_AUDITOR',
        'AUDITOR',
    )
    @Permissions('reports.manage')
    @ApiOperation({
        summary: 'Hoàn thành cuộc đánh giá',
        description: 'Ghi nhận ngày, man-day thực tế của từng thành viên và khóa trạng thái thực hiện.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Cuộc đánh giá đã hoàn thành',
    })
    @ApiBadRequestResponse({
        description: 'Báo cáo chưa nộp hoặc dữ liệu thực tế không hợp lệ',
    })
    async complete(
        @Param('id')
        id: string,

        @Body()
        dto: CompleteAuditPlanDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'audit_plan',
                entity_id: id,
            },
            getResourceActor(request),
        );

        const actor = getResourceActor(request);
        await this.actionAuthorization.assertCanPerformAction({
            user: actor,
            actionCode: WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
            resource: {
                entityType: 'audit_plan',
                entityId: id,
            },
            assignment: {
                assignedUserId: actor.userId,
            },
            workflowState: 'IN_PROGRESS',
        });

        return this.auditPlansService.complete(
            id,
            dto,
            this.getUserId(request),
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
    @Permissions('audit_plans.read')
    @ApiOperation({
        summary: 'Lấy danh sách kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Danh sách kế hoạch đánh giá',
    })
    async findAll(
        @Req()
        request: SecurityRequest,
    ) {
        const plans =
            await this.auditPlansService.findAll();

        const scoped =
            await this.resourceAccess.filterEntities(
                plans.map((plan) => ({
                    ...plan,
                    entity_type: 'audit_plan',
                    entity_id: plan.id,
                })),
                getResourceActor(request),
            );

        return scoped.map(({
            entity_type: _entityType,
            entity_id: _entityId,
            ...plan
        }) => plan);
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
    @Permissions('audit_plans.read')
    @ApiOperation({
        summary: 'Lấy kế hoạch đánh giá theo dự án',
    })
    @ApiParam({
        name: 'projectId',
        description: 'UUID dự án chứng nhận',
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
    })
    @ApiOkResponse({
        description: 'Các kế hoạch thuộc dự án',
    })
    async findByProject(
        @Param('projectId')
        projectId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertProjectAccess(
            projectId,
            getResourceActor(request),
        );

        return this.auditPlansService.findByProject(
            projectId,
        );
    }

    @Get('event/:eventId')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_plans.read')
    @ApiOperation({
        summary: 'Lấy kế hoạch theo sự kiện đánh giá',
    })
    @ApiParam({
        name: 'eventId',
        description: 'UUID sự kiện đánh giá',
        example: 'a5305c0d-6c2a-4936-a730-cd1b48daee5b',
    })
    @ApiOkResponse({
        description: 'Kế hoạch của sự kiện đánh giá',
    })
    async findByEvent(
        @Param('eventId')
        eventId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'audit_program_event',
                entity_id: eventId,
            },
            getResourceActor(request),
        );

        return this.auditPlansService.findByEvent(
            eventId,
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
    @Permissions('audit_plans.read')
    @ApiOperation({
        summary: 'Lấy chi tiết kế hoạch đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID kế hoạch đánh giá',
        example: '6db25d8d-71d7-4458-a917-55b02b23fe93',
    })
    @ApiOkResponse({
        description: 'Chi tiết kế hoạch đánh giá',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy kế hoạch đánh giá',
    })
    async findOne(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'audit_plan',
                entity_id: id,
            },
            getResourceActor(request),
        );

        return this.auditPlansService.findOne(id);
    }

    @Patch(':id')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_plans.manage')
    @ApiOperation({
        summary: 'Cập nhật kế hoạch đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Cập nhật kế hoạch thành công',
    })
    update(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateAuditPlanDto,
    ) {
        return this.auditPlansService.update(
            id,
            dto,
        );
    }

    @Delete(':id')
    @Roles('ADMIN')
    @Permissions('audit_plans.manage')
    @ApiOperation({
        summary: 'Xóa kế hoạch đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Đã xóa kế hoạch đánh giá',
    })
    remove(
        @Param('id')
        id: string,
    ) {
        return this.auditPlansService.remove(id);
    }
}

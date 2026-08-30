import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
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

import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ReportDocumentsService } from './report-documents.service';
import { ReportsService } from './reports.service';

@Controller('reports')
@ApiTags('12. Báo cáo đánh giá')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class ReportsController {
    constructor(
        private readonly reportsService:
            ReportsService,
        private readonly reportDocumentsService:
            ReportDocumentsService,
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
        'AUDITOR',
        'LEAD_AUDITOR',
    )
    @Permissions(
        'reports.manage',
    )
    @ApiOperation({
        summary: 'Tạo báo cáo đánh giá',
    })
    @ApiCreatedResponse({
        description: 'Tạo báo cáo thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu, ngày đánh giá hoặc kế hoạch không hợp lệ',
    })
    async create(
        @Body()
        dto: CreateReportDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'audit_plan',
                entity_id: dto.audit_plan_id,
            },
            getResourceActor(request),
        );

        const actor = getResourceActor(request);
        await this.actionAuthorization.assertCanPerformAction({
            user: actor,
            actionCode: WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
            resource: {
                entityType: 'audit_plan',
                entityId: dto.audit_plan_id,
            },
            assignment: {
                assignedUserId: actor.userId,
            },
            workflowState: 'OPEN',
        });

        return this.reportsService.create(
            dto,
            this.getUserId(
                request,
            ),
        );
    }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions(
        'projects.read',
    )
    @ApiOperation({
        summary: 'Lấy danh sách báo cáo đánh giá',
    })
    @ApiOkResponse({
        description: 'Danh sách báo cáo đánh giá',
    })
    async findAll(
        @Req()
        request: SecurityRequest,
    ) {
        const reports =
            await this.reportsService.findAll();

        const scoped =
            await this.resourceAccess.filterEntities(
                reports.map((report) => ({
                    ...report,
                    entity_type: 'report',
                    entity_id: report.id,
                })),
                getResourceActor(request),
            );

        return scoped.map(({
            entity_type: _entityType,
            entity_id: _entityId,
            ...report
        }) => report);
    }

    @Get('plan/:auditPlanId')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions(
        'projects.read',
    )
    @ApiOperation({
        summary: 'Lấy báo cáo theo kế hoạch đánh giá',
    })
    @ApiParam({
        name: 'auditPlanId',
        description: 'UUID kế hoạch đánh giá',
        example: '6db25d8d-71d7-4458-a917-55b02b23fe93',
    })
    @ApiOkResponse({
        description: 'Các báo cáo thuộc kế hoạch',
    })
    async findByPlan(
        @Param('auditPlanId')
        auditPlanId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'audit_plan',
                entity_id: auditPlanId,
            },
            getResourceActor(request),
        );

        return this.reportsService.findByPlan(
            auditPlanId,
        );
    }

    @Get(':id/document-preview')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('projects.read')
    @ApiOperation({
        summary: 'Xem trước dữ liệu sẽ đưa vào mẫu Word/PDF',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID báo cáo',
    })
    @ApiOkResponse({
        description: 'Dữ liệu tổng hợp và cảnh báo trường còn thiếu',
    })
    async previewDocument(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'report', entity_id: id },
            getResourceActor(request),
        );

        return this.reportDocumentsService.preview(id);
    }

    @Post(':id/documents/generate')
    @Roles(
        'AUDITOR',
        'LEAD_AUDITOR',
    )
    @Permissions('reports.manage')
    @ApiOperation({
        summary: 'Sinh báo cáo đánh giá Word hoặc PDF từ dữ liệu hệ thống',
        description:
            'Tạo snapshot dữ liệu, điền mẫu F.09-P.09-01/F.09-P.09-02, lưu phiên bản vào document_files và trả đường dẫn tải có kiểm soát.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID báo cáo',
    })
    @ApiQuery({
        name: 'format',
        required: true,
        enum: ['docx', 'pdf'],
        description: 'Định dạng cần sinh',
    })
    @ApiCreatedResponse({
        description: 'Đã sinh và lưu phiên bản tài liệu',
    })
    @ApiBadRequestResponse({
        description: 'Sai định dạng hoặc máy chủ không có bộ chuyển PDF',
    })
    async generateDocument(
        @Param('id')
        id: string,

        @Query('format')
        format: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'report', entity_id: id },
            getResourceActor(request),
        );

        const actor = getResourceActor(request);
        await this.actionAuthorization.assertCanPerformAction({
            user: actor,
            actionCode: WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
            resource: {
                entityType: 'report',
                entityId: id,
            },
            assignment: {
                assignedUserId: actor.userId,
            },
            workflowState: 'OPEN',
        });

        await this.reportsService.assertCanManageReport(
            this.getUserId(request),
            id,
        );

        return this.reportDocumentsService.generate(
            id,
            format,
            this.getUserId(request),
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions(
        'projects.read',
    )
    @ApiOperation({
        summary: 'Lấy chi tiết báo cáo đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID báo cáo',
        example: '225a2ae7-4994-42f4-bc15-f64b00e3a7b4',
    })
    @ApiOkResponse({
        description: 'Chi tiết báo cáo và dữ liệu liên quan',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy báo cáo',
    })
    async findOne(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'report', entity_id: id },
            getResourceActor(request),
        );

        return this.reportsService.findOne(
            id,
        );
    }

    @Patch(':id')
    @Roles(
        'AUDITOR',
        'LEAD_AUDITOR',
    )
    @Permissions(
        'reports.manage',
    )
    @ApiOperation({
        summary: 'Cập nhật báo cáo đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID báo cáo',
    })
    @ApiOkResponse({
        description: 'Cập nhật báo cáo thành công',
    })
    async update(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateReportDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'report', entity_id: id },
            getResourceActor(request),
        );

        const actor = getResourceActor(request);
        await this.actionAuthorization.assertCanPerformAction({
            user: actor,
            actionCode: WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
            resource: {
                entityType: 'report',
                entityId: id,
            },
            assignment: {
                assignedUserId: actor.userId,
            },
            workflowState: 'OPEN',
        });

        return this.reportsService.update(
            id,
            dto,
            this.getUserId(request),
        );
    }

    @Post(':id/submit')
    @Roles(
        'AUDITOR',
        'LEAD_AUDITOR',
    )
    @Permissions('reports.manage')
    @ApiOperation({
        summary: 'Nộp báo cáo đánh giá',
        description: 'Kiểm tra nội dung bắt buộc và chuyển báo cáo sang chờ khắc phục NC hoặc sẵn sàng thẩm xét kỹ thuật.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID báo cáo',
    })
    @ApiOkResponse({
        description: 'Báo cáo đã được nộp',
    })
    @ApiBadRequestResponse({
        description: 'Báo cáo còn thiếu dữ liệu bắt buộc',
    })
    async submit(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'report', entity_id: id },
            getResourceActor(request),
        );

        const actor = getResourceActor(request);
        await this.actionAuthorization.assertCanPerformAction({
            user: actor,
            actionCode: WORK_ITEM_ACTIONS.AUDIT_EXECUTE,
            resource: {
                entityType: 'report',
                entityId: id,
            },
            assignment: {
                assignedUserId: actor.userId,
            },
            workflowState: 'OPEN',
        });

        return this.reportsService.submit(
            id,
            this.getUserId(request),
        );
    }

    @Delete(':id')
    @Roles('ADMIN')
    @ApiOperation({
        summary: 'Xóa báo cáo chưa sử dụng',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID báo cáo',
    })
    @ApiOkResponse({
        description: 'Đã xóa báo cáo',
    })
    remove(
        @Param('id')
        id: string,
    ) {
        return this.reportsService.remove(
            id,
        );
    }
}

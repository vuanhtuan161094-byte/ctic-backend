import {
    Body,
    Controller,
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

import { AuditFindingsService } from './audit-findings.service';
import { CloseAuditFindingDto } from './dto/close-audit-finding.dto';
import { CreateAuditFindingDto } from './dto/create-audit-finding.dto';
import { CreateCorrectiveActionDto } from './dto/create-corrective-action.dto';
import { ReviewCorrectiveActionDto } from './dto/review-corrective-action.dto';

@Controller('audit-findings')
@ApiTags('13. NC và hành động khắc phục')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class AuditFindingsController {
    constructor(
        private readonly auditFindingsService:
            AuditFindingsService,
        private readonly resourceAccess:
            ResourceAccessService,
    ) { }

    private getUserId(
        request: SecurityRequest,
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
        'AUDITOR',
        'LEAD_AUDITOR',
    )
    @Permissions('findings.manage')
    @ApiOperation({
        summary: 'Tạo phát hiện đánh giá',
    })
    @ApiCreatedResponse({
        description: 'Tạo phát hiện thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu hoặc loại phát hiện không hợp lệ',
    })
    async create(
        @Body()
        dto: CreateAuditFindingDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'report', entity_id: dto.report_id },
            getResourceActor(request),
        );

        return this.auditFindingsService.create(
            dto,
            this.getUserId(request),
        );
    }

    @Post(':id/corrective-actions')
    @Roles(
        'ADMIN',
        'CUSTOMER',
    )
    @Permissions('customer_portal.access')
    @ApiOperation({
        summary: 'Gửi hành động khắc phục cho một NC',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID phát hiện đánh giá',
    })
    @ApiCreatedResponse({
        description: 'Đã gửi hành động khắc phục',
    })
    @ApiBadRequestResponse({
        description: 'Phát hiện không yêu cầu CAP hoặc dữ liệu không hợp lệ',
    })
    createCorrectiveAction(
        @Param('id')
        id: string,

        @Body()
        dto: CreateCorrectiveActionDto,

        @Req()
        request: SecurityRequest,
    ) {
        return this.auditFindingsService
            .createCorrectiveAction(
                id,
                dto,
                this.getUserId(request),
            );
    }

    @Post(':id/corrective-actions/internal')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'AUDITOR',
        'LEAD_AUDITOR',
    )
    @Permissions('findings.manage')
    @ApiOperation({
        summary: 'Nhập phản hồi hành động khắc phục thay khách hàng',
        description: 'Dùng khi khách hàng gửi phản hồi qua email hoặc bản giấy; vẫn tạo phiên bản CAP và lưu người nhập.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID phát hiện đánh giá',
    })
    @ApiCreatedResponse({
        description: 'Đã tạo phiên bản phản hồi hành động khắc phục',
    })
    async createCorrectiveActionInternal(
        @Param('id')
        id: string,

        @Body()
        dto: CreateCorrectiveActionDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_finding', entity_id: id },
            getResourceActor(request),
        );

        return this.auditFindingsService.createCorrectiveAction(
            id,
            dto,
            this.getUserId(request),
        );
    }

    @Patch(
        ':findingId/corrective-actions/:actionId/review',
    )
    @Roles(
        'ADMIN',
        'AUDITOR',
        'LEAD_AUDITOR',
    )
    @Permissions('findings.manage')
    @ApiOperation({
        summary: 'Xem xét hành động khắc phục',
    })
    @ApiParam({
        name: 'findingId',
        description: 'UUID phát hiện đánh giá',
    })
    @ApiParam({
        name: 'actionId',
        description: 'UUID phiên bản hành động khắc phục',
    })
    @ApiOkResponse({
        description: 'Đã ghi nhận kết quả xem xét',
    })
    async reviewCorrectiveAction(
        @Param('findingId')
        findingId: string,

        @Param('actionId')
        actionId: string,

        @Body()
        dto: ReviewCorrectiveActionDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_finding', entity_id: findingId },
            getResourceActor(request),
        );

        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'corrective_action', entity_id: actionId },
            getResourceActor(request),
        );

        return this.auditFindingsService
            .reviewCorrectiveAction(
                findingId,
                actionId,
                dto,
                this.getUserId(request),
            );
    }

    @Patch(':id/close')
    @Roles(
        'ADMIN',
        'AUDITOR',
        'LEAD_AUDITOR',
    )
    @Permissions('findings.manage')
    @ApiOperation({
        summary: 'Đóng phát hiện đánh giá',
        description: 'Chỉ đóng khi đã có hành động khắc phục được chấp nhận.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID phát hiện đánh giá',
    })
    @ApiOkResponse({
        description: 'Phát hiện đã được đóng',
    })
    @ApiBadRequestResponse({
        description: 'Chưa có hành động khắc phục được chấp nhận',
    })
    async close(
        @Param('id')
        id: string,

        @Body()
        dto: CloseAuditFindingDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_finding', entity_id: id },
            getResourceActor(request),
        );

        return this.auditFindingsService.close(
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
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('projects.read')
    @ApiOperation({
        summary: 'Lấy danh sách phát hiện và NC/CAP',
    })
    @ApiOkResponse({
        description: 'Danh sách phát hiện đánh giá',
    })
    async findAll(
        @Req()
        request: SecurityRequest,
    ) {
        const findings =
            await this.auditFindingsService.findAll();

        const scoped =
            await this.resourceAccess.filterEntities(
                findings.map((finding) => ({
                    ...finding,
                    entity_type: 'audit_finding',
                    entity_id: finding.id,
                })),
                getResourceActor(request),
            );

        return scoped.map(({
            entity_type: _entityType,
            entity_id: _entityId,
            ...finding
        }) => finding);
    }

    @Get('report/:reportId')
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
        summary: 'Lấy phát hiện theo báo cáo',
    })
    @ApiParam({
        name: 'reportId',
        description: 'UUID báo cáo đánh giá',
        example: '225a2ae7-4994-42f4-bc15-f64b00e3a7b4',
    })
    @ApiOkResponse({
        description: 'Các phát hiện thuộc báo cáo',
    })
    async findByReport(
        @Param('reportId')
        reportId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'report', entity_id: reportId },
            getResourceActor(request),
        );

        return this.auditFindingsService.findByReport(
            reportId,
        );
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
    @Permissions('projects.read')
    @ApiOperation({
        summary: 'Lấy toàn bộ phát hiện và CAP theo kế hoạch đánh giá',
    })
    @ApiParam({
        name: 'auditPlanId',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Danh sách phát hiện, các phiên bản CAP và tệp bằng chứng',
    })
    async findByPlan(
        @Param('auditPlanId')
        auditPlanId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_plan', entity_id: auditPlanId },
            getResourceActor(request),
        );

        return this.auditFindingsService.findByPlan(auditPlanId);
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
    @Permissions('projects.read')
    @ApiOperation({
        summary: 'Lấy chi tiết phát hiện và hành động khắc phục',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID phát hiện đánh giá',
        example: 'a85ef2be-eb6d-4ebf-ba33-f708c3c3da94',
    })
    @ApiOkResponse({
        description: 'Chi tiết phát hiện và các phiên bản CAP',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy phát hiện',
    })
    async findOne(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_finding', entity_id: id },
            getResourceActor(request),
        );

        return this.auditFindingsService.findOne(id);
    }
}

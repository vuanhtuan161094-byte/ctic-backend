import {
    BadRequestException,
    Body,
    Controller,
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

import { TechnicalReviewsService } from './technical-reviews.service';
import { AuditDocumentsService } from '../audit-documents/audit-documents.service';
import { AttachReviewDocumentDto } from './dto/attach-review-document.dto';
import { CreateTechnicalReviewDto } from './dto/create-technical-review.dto';
import { UpdateReviewItemDto } from './dto/update-review-item.dto';
import { UpdateTechnicalReviewReportDto } from './dto/update-technical-review-report.dto';
import { SaveTechnicalReviewWorkspaceDto } from './dto/save-technical-review-workspace.dto';

@Controller('technical-reviews')
@ApiTags('15. Thẩm xét kỹ thuật')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class TechnicalReviewsController {
    constructor(
        private readonly technicalReviewsService:
            TechnicalReviewsService,
        private readonly auditDocumentsService:
            AuditDocumentsService,
        private readonly resourceAccess:
            ResourceAccessService,
    ) { }

    private getUserId(
        request: SecurityRequest,
    ) {
        return request.user?.id ??
            request.user?.userId ??
            request.user?.sub;
    }

    @Get('plan/:planId/workspace')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('technical_reviews.read')
    @ApiOperation({
        summary: 'Lấy không gian thẩm xét kỹ thuật và dữ liệu F.11 theo PLAN',
    })
    @ApiParam({
        name: 'planId',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Điều kiện bắt đầu, hồ sơ thẩm xét, tiêu chí F.11 và lịch sử tài liệu',
    })
    async getWorkspaceByPlan(
        @Param('planId')
        planId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_plan', entity_id: planId },
            getResourceActor(request),
        );

        return this.technicalReviewsService
            .getWorkspaceByPlan(planId);
    }

    @Post('plan/:planId/ensure')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Bắt đầu hoặc mở lại hồ sơ thẩm xét kỹ thuật của PLAN',
    })
    @ApiParam({
        name: 'planId',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiCreatedResponse({
        description: 'Đã tạo/mở hồ sơ thẩm xét và gán cho người dùng hiện tại',
    })
    async ensureForPlan(
        @Param('planId')
        planId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_plan', entity_id: planId },
            getResourceActor(request),
        );

        return this.technicalReviewsService
            .ensureForPlan(
                planId,
                this.getUserId(request),
            );
    }

    @Patch(':id/workspace')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Lưu dữ liệu thẩm xét sơ bộ, kỹ thuật và kiến nghị F.11',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét',
    })
    @ApiOkResponse({
        description: 'Đã lưu dự thảo F.11-P.09',
    })
    async saveWorkspace(
        @Param('id')
        id: string,

        @Body()
        dto: SaveTechnicalReviewWorkspaceDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService
            .saveWorkspace(
                id,
                dto,
            );
    }

    @Post(':id/f11/generate')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Sinh báo cáo thẩm xét F.11-P.09 ở định dạng Word/PDF',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét kỹ thuật',
    })
    @ApiQuery({
        name: 'format',
        required: true,
        enum: ['docx', 'pdf'],
    })
    @ApiCreatedResponse({
        description: 'Đã sinh và lưu phiên bản F.11-P.09',
    })
    async generateF11(
        @Param('id')
        id: string,

        @Query('format')
        format: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        const review =
            await this.technicalReviewsService.findOne(id);

        const planId =
            review.reports?.audit_plan_id;

        if (!planId) {
            throw new BadRequestException(
                'Không xác định được kế hoạch của hồ sơ thẩm xét',
            );
        }

        return this.auditDocumentsService.generate(
            planId,
            'technical_review_report_f11',
            format,
            this.getUserId(request),
            undefined,
            undefined,
            undefined,
        );
    }

    @Patch(':id/sync-documents')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Đồng bộ danh mục tài liệu thẩm xét',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét kỹ thuật',
    })
    @ApiOkResponse({
        description: 'Đã đồng bộ các tài liệu hiện có',
    })
    async syncDocuments(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService
            .syncDocuments(id);
    }

    @Patch(':id/items/:documentKey/file')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Gắn phiên bản tệp vào hạng mục thẩm xét',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét',
    })
    @ApiParam({
        name: 'documentKey',
        example: 'audit_checklist',
        description: 'Khóa loại tài liệu cần thẩm xét',
    })
    @ApiOkResponse({
        description: 'Đã gắn phiên bản tài liệu; trạng thái được mở lại nếu cần',
    })
    async attachDocument(
        @Param('id')
        id: string,

        @Param('documentKey')
        documentKey: string,

        @Body()
        dto: AttachReviewDocumentDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService
            .attachDocument(
                id,
                documentKey,
                dto,
            );
    }

    @Post()
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Tạo hồ sơ thẩm xét kỹ thuật',
    })
    @ApiCreatedResponse({
        description: 'Tạo hồ sơ thẩm xét thành công',
    })
    @ApiBadRequestResponse({
        description: 'Báo cáo chưa đáp ứng điều kiện thẩm xét',
    })
    async create(
        @Body()
        dto: CreateTechnicalReviewDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'report', entity_id: dto.report_id },
            getResourceActor(request),
        );

        return this.technicalReviewsService.create(
            dto,
        );
    }

    @Get()
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('technical_reviews.read')
    @ApiOperation({
        summary: 'Lấy danh sách hồ sơ thẩm xét kỹ thuật',
    })
    @ApiOkResponse({
        description: 'Danh sách hồ sơ thẩm xét',
    })
    async findAll(
        @Req()
        request: SecurityRequest,
    ) {
        const reviews =
            await this.technicalReviewsService.findAll();

        const scoped =
            await this.resourceAccess.filterEntities(
                reviews.map((review) => ({
                    ...review,
                    entity_type: 'technical_review',
                    entity_id: review.id,
                })),
                getResourceActor(request),
            );

        return scoped.map(({
            entity_type: _entityType,
            entity_id: _entityId,
            ...review
        }) => review);
    }

    @Get('report/:reportId')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('technical_reviews.read')
    @ApiOperation({
        summary: 'Lấy hồ sơ thẩm xét theo báo cáo đánh giá',
    })
    @ApiParam({
        name: 'reportId',
        description: 'UUID báo cáo đánh giá',
        example: '225a2ae7-4994-42f4-bc15-f64b00e3a7b4',
    })
    @ApiOkResponse({
        description: 'Hồ sơ thẩm xét của báo cáo',
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

        return this.technicalReviewsService.findByReport(
            reportId,
        );
    }

    @Patch(':id/report')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Cập nhật báo cáo thẩm xét kỹ thuật',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét',
    })
    @ApiOkResponse({
        description: 'Đã lưu báo cáo và khuyến nghị thẩm xét',
    })
    async updateTechnicalReviewReport(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateTechnicalReviewReportDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService
            .updateTechnicalReviewReport(
                id,
                dto,
            );
    }

    @Get(':id/report')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('technical_reviews.read')
    @ApiOperation({
        summary: 'Lấy báo cáo thẩm xét kỹ thuật',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét',
        example: 'f842c677-f9ac-4ec3-972c-58ccf5e3d13e',
    })
    @ApiOkResponse({
        description: 'Nội dung báo cáo thẩm xét',
    })
    async getTechnicalReviewReport(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService
            .getTechnicalReviewReport(id);
    }

    @Get(':id/items/:documentKey/preview')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('technical_reviews.read')
    @ApiOperation({
        summary: 'Xem nhanh dữ liệu hoặc tệp của một hạng mục thẩm xét',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét',
    })
    @ApiParam({
        name: 'documentKey',
        description: 'Khóa hạng mục hồ sơ cần xem',
    })
    @ApiOkResponse({
        description: 'Dữ liệu xem nhanh và các tệp hiện hành của hạng mục',
    })
    async getReviewItemPreview(
        @Param('id')
        id: string,

        @Param('documentKey')
        documentKey: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService
            .getReviewItemPreview(
                id,
                documentKey,
            );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('technical_reviews.read')
    @ApiOperation({
        summary: 'Lấy chi tiết hồ sơ thẩm xét',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét',
    })
    @ApiOkResponse({
        description: 'Hồ sơ, hạng mục và tài liệu thẩm xét',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy hồ sơ thẩm xét',
    })
    async findOne(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService.findOne(id);
    }

    @Patch(':id/items/:documentKey')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Cập nhật kết quả một hạng mục thẩm xét',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét',
    })
    @ApiParam({
        name: 'documentKey',
        example: 'audit_checklist',
        description: 'Khóa loại tài liệu',
    })
    @ApiOkResponse({
        description: 'Đã cập nhật trạng thái hạng mục',
    })
    async updateReviewItem(
        @Param('id')
        id: string,

        @Param('documentKey')
        documentKey: string,

        @Body()
        dto: UpdateReviewItemDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService.updateReviewItem(
            id,
            documentKey,
            dto,
        );
    }

    @Patch(':id/complete')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
    @ApiOperation({
        summary: 'Hoàn thành thẩm xét kỹ thuật',
        description: 'Xác nhận bằng tài khoản và cập nhật báo cáo sang technical_review_completed.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID hồ sơ thẩm xét',
    })
    @ApiOkResponse({
        description: 'Hồ sơ thẩm xét đã hoàn thành',
    })
    @ApiBadRequestResponse({
        description: 'Còn tài liệu chưa được chấp nhận hoặc thiếu báo cáo thẩm xét',
    })
    async complete(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'technical_review', entity_id: id },
            getResourceActor(request),
        );

        return this.technicalReviewsService.complete(id);
    }
}

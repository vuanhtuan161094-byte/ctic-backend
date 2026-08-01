import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
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

import { TechnicalReviewsService } from './technical-reviews.service';
import { AttachReviewDocumentDto } from './dto/attach-review-document.dto';
import { CreateTechnicalReviewDto } from './dto/create-technical-review.dto';
import { UpdateReviewItemDto } from './dto/update-review-item.dto';
import { UpdateTechnicalReviewReportDto } from './dto/update-technical-review-report.dto';

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
    ) { }

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
    syncDocuments(
        @Param('id')
        id: string,
    ) {
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
    attachDocument(
        @Param('id')
        id: string,

        @Param('documentKey')
        documentKey: string,

        @Body()
        dto: AttachReviewDocumentDto,
    ) {
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
    create(
        @Body()
        dto: CreateTechnicalReviewDto,
    ) {
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
    findAll() {
        return this.technicalReviewsService.findAll();
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
    findByReport(
        @Param('reportId')
        reportId: string,
    ) {
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
    updateTechnicalReviewReport(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateTechnicalReviewReportDto,
    ) {
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
    getTechnicalReviewReport(
        @Param('id')
        id: string,
    ) {
        return this.technicalReviewsService
            .getTechnicalReviewReport(id);
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
    findOne(
        @Param('id')
        id: string,
    ) {
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
    updateReviewItem(
        @Param('id')
        id: string,

        @Param('documentKey')
        documentKey: string,

        @Body()
        dto: UpdateReviewItemDto,
    ) {
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
    complete(
        @Param('id')
        id: string,
    ) {
        return this.technicalReviewsService.complete(id);
    }
}

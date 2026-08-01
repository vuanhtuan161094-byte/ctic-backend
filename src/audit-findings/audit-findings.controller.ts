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

import { AuditFindingsService } from './audit-findings.service';
import { CloseAuditFindingDto } from './dto/close-audit-finding.dto';
import { CreateAuditFindingDto } from './dto/create-audit-finding.dto';
import { CreateCorrectiveActionDto } from './dto/create-corrective-action.dto';
import { ReviewCorrectiveActionDto } from './dto/review-corrective-action.dto';

interface AuthenticatedRequest {
    user?: {
        id?: string;
        userId?: string;
        sub?: string;
    };
}

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
    ) { }

    private getUserId(
        request: AuthenticatedRequest,
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
    create(
        @Body()
        dto: CreateAuditFindingDto,

        @Req()
        request: AuthenticatedRequest,
    ) {
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
        request: AuthenticatedRequest,
    ) {
        return this.auditFindingsService
            .createCorrectiveAction(
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
    reviewCorrectiveAction(
        @Param('findingId')
        findingId: string,

        @Param('actionId')
        actionId: string,

        @Body()
        dto: ReviewCorrectiveActionDto,

        @Req()
        request: AuthenticatedRequest,
    ) {
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
    close(
        @Param('id')
        id: string,

        @Body()
        dto: CloseAuditFindingDto,

        @Req()
        request: AuthenticatedRequest,
    ) {
        return this.auditFindingsService.close(
            id,
            dto,
            this.getUserId(request),
        );
    }

    @Get()
    @Roles(
        'ADMIN',
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('findings.read')
    @ApiOperation({
        summary: 'Lấy danh sách phát hiện và NC/CAP',
    })
    @ApiOkResponse({
        description: 'Danh sách phát hiện đánh giá',
    })
    findAll() {
        return this.auditFindingsService.findAll();
    }

    @Get('report/:reportId')
    @Roles(
        'ADMIN',
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('findings.read')
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
    findByReport(
        @Param('reportId')
        reportId: string,
    ) {
        return this.auditFindingsService.findByReport(
            reportId,
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'AUDITOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('findings.read')
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
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.auditFindingsService.findOne(id);
    }
}

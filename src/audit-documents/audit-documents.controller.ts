import {
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

import { AuditDocumentsService } from './audit-documents.service';
import { SaveAuditDocumentDataDto } from './dto/save-audit-document-data.dto';

@Controller('audit-documents')
@ApiTags('10B. Hồ sơ Word/PDF đánh giá')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class AuditDocumentsController {
    constructor(
        private readonly auditDocumentsService:
            AuditDocumentsService,
        private readonly resourceAccess:
            ResourceAccessService,
    ) { }

    private getUserId(request: SecurityRequest) {
        return request.user?.id ??
            request.user?.userId ??
            request.user?.sub;
    }

    @Get('plan/:planId')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_EXPERT',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('audit_plans.read')
    @ApiOperation({
        summary: 'Xem dữ liệu và lịch sử hồ sơ F.03, F.04, F.05, F.06, F.07, F.10, F.11, F.15, F.17',
    })
    @ApiParam({
        name: 'planId',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Dữ liệu bổ sung, cảnh báo và các phiên bản tài liệu đã sinh',
    })
    async preview(
        @Param('planId')
        planId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_plan', entity_id: planId },
            getResourceActor(request),
        );

        return this.auditDocumentsService.preview(planId);
    }

    @Patch('plan/:planId/data')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
    )
    @Permissions('documents.manage')
    @ApiOperation({
        summary: 'Lưu dữ liệu bổ sung dùng để sinh F.05, F.06 và F.07',
    })
    @ApiParam({
        name: 'planId',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiOkResponse({
        description: 'Đã lưu dữ liệu bổ sung của tài liệu kế hoạch',
    })
    @ApiBadRequestResponse({
        description: 'Ngày lập hoặc lịch trình không hợp lệ',
    })
    async saveData(
        @Param('planId')
        planId: string,

        @Body()
        dto: SaveAuditDocumentDataDto,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_plan', entity_id: planId },
            getResourceActor(request),
        );

        return this.auditDocumentsService.saveData(
            planId,
            dto,
            this.getUserId(request),
        );
    }

    @Post('plan/:planId/generate')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
    )
    @Permissions('documents.manage')
    @ApiOperation({
        summary: 'Sinh F.03, F.04, F.05, F.06, F.07, F.10, F.15 hoặc F.17 ở định dạng Word/PDF',
        description:
            'Dùng cùng một snapshot dữ liệu cho Word và PDF; mỗi lần xuất tạo một phiên bản trong document_files.',
    })
    @ApiParam({
        name: 'planId',
        description: 'UUID kế hoạch đánh giá',
    })
    @ApiQuery({
        name: 'documentType',
        required: true,
        enum: [
            'audit_program_f03',
            'audit_team_assignment_f04',
            'audit_plan_f05',
            'audit_attendance_f07',
            'audit_log_f15',
            'audit_monitoring_f17',
            'audit_checklist_f06',
            'corrective_action_request_f10',
            'technical_review_report_f11',
        ],
    })
    @ApiQuery({
        name: 'format',
        required: true,
        enum: ['docx', 'pdf'],
    })
    @ApiQuery({
        name: 'memberId',
        required: false,
        description: 'Bắt buộc khi sinh F.15-P.09 cho một thành viên đoàn',
    })
    @ApiQuery({
        name: 'programKey',
        required: false,
        description: 'Bắt buộc khi sinh F.06-P.09 cho một chương trình/tiêu chuẩn',
    })
    @ApiQuery({
        name: 'findingId',
        required: false,
        description: 'Bắt buộc khi sinh F.10-P.09 cho một điểm không phù hợp',
    })
    @ApiCreatedResponse({
        description: 'Đã sinh, lưu phiên bản và trả đường dẫn tải',
    })
    async generate(
        @Param('planId')
        planId: string,

        @Query('documentType')
        documentType: string,

        @Query('format')
        format: string,

        @Query('memberId')
        memberId: string | undefined,

        @Query('programKey')
        programKey: string | undefined,

        @Query('findingId')
        findingId: string | undefined,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_plan', entity_id: planId },
            getResourceActor(request),
        );

        return this.auditDocumentsService.generate(
            planId,
            documentType,
            format,
            this.getUserId(request),
            memberId,
            programKey,
            findingId,
        );
    }
}

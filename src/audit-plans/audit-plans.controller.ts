import {
    Body,
    Controller,
    Delete,
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

import { AuditPlansService } from './audit-plans.service';
import { CreateAuditPlanDto } from './dto/create-audit-plan.dto';
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
    ) { }

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
    findAll() {
        return this.auditPlansService.findAll();
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
    findByProject(
        @Param('projectId')
        projectId: string,
    ) {
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
    findByEvent(
        @Param('eventId')
        eventId: string,
    ) {
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
    findOne(
        @Param('id')
        id: string,
    ) {
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

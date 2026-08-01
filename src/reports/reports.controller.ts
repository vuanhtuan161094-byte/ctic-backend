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

import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
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
        'STAFF',
        'AUDITOR',
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
    create(
        @Body()
        dto: CreateReportDto,

        @Req()
        request: {
            user?: {
                id?: string;
                userId?: string;
                sub?: string;
            };
        },
    ) {
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
        'AUDITOR',
    )
    @Permissions(
        'reports.manage',
    )
    @ApiOperation({
        summary: 'Lấy danh sách báo cáo đánh giá',
    })
    @ApiOkResponse({
        description: 'Danh sách báo cáo đánh giá',
    })
    findAll() {
        return this.reportsService.findAll();
    }

    @Get('plan/:auditPlanId')
    @Roles(
        'ADMIN',
        'STAFF',
        'AUDITOR',
    )
    @Permissions(
        'reports.manage',
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
    findByPlan(
        @Param('auditPlanId')
        auditPlanId: string,
    ) {
        return this.reportsService.findByPlan(
            auditPlanId,
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'AUDITOR',
    )
    @Permissions(
        'reports.manage',
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
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.reportsService.findOne(
            id,
        );
    }

    @Patch(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'AUDITOR',
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
    update(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateReportDto,
    ) {
        return this.reportsService.update(
            id,
            dto,
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

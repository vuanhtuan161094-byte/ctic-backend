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

import { MandayCalculationsService } from './manday-calculations.service';
import { CreateMandayCalculationDto } from './dto/create-manday-calculation.dto';
import { UpdateMandayCalculationDto } from './dto/update-manday-calculation.dto';
import { SuggestMandayDto } from './dto/suggest-manday.dto';
import { MandayRulesService } from './manday-rules.service';

@Controller('manday-calculations')
@ApiTags('08. Tính man-day')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class MandayCalculationsController {
    constructor(
        private readonly mandayCalculationsService:
            MandayCalculationsService,
        private readonly mandayRulesService: MandayRulesService,
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

    @Get('reference-tables')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('mandays.read')
    @ApiOperation({
        summary: 'Lấy các bảng tra cứu man-day',
        description: 'Trả về bảng QMS, EMS, ISO 45001, ma trận IMS và quy tắc nhiều địa điểm để giao diện cho phép người dùng chọn trực tiếp.',
    })
    @ApiOkResponse({ description: 'Các bảng tra cứu và quy tắc đang áp dụng' })
    referenceTables() {
        return this.mandayRulesService.getReferenceTables();
    }

    @Post('suggest')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('mandays.read')
    @ApiOperation({
        summary: 'Đề xuất man-day tự động',
        description: 'Tính đề xuất cho QMS, EMS, ISO 45001, IMS và tổ chức nhiều địa điểm theo cấu hình IAF/R.01.',
    })
    @ApiOkResponse({ description: 'Kết quả đề xuất và các cảnh báo cần xem xét' })
    suggest(@Body() dto: SuggestMandayDto) {
        return this.mandayRulesService.suggest(dto);
    }

    @Post()
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('mandays.manage')
    @ApiOperation({
        summary: 'Tạo bản tính man-day',
        description: 'Tạo và lưu cơ sở tính thời lượng đánh giá theo R.01.',
    })
    @ApiCreatedResponse({
        description: 'Tạo bản tính thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu hoặc các tỷ lệ điều chỉnh không hợp lệ',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy dự án chứng nhận',
    })
    create(
        @Body()
        dto: CreateMandayCalculationDto,

        @Req()
        request: {
            user?: {
                id?: string;
                userId?: string;
                sub?: string;
            };
        },
    ) {
        return this.mandayCalculationsService.create(
            dto,
            this.getUserId(request),
        );
    }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('mandays.read')
    @ApiOperation({
        summary: 'Lấy danh sách bản tính man-day',
    })
    @ApiOkResponse({
        description: 'Danh sách bản tính man-day',
    })
    findAll() {
        return this.mandayCalculationsService.findAll();
    }

    @Post('project/:projectId/sync-from-review')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('mandays.manage')
    @ApiOperation({
        summary: 'Đồng bộ bản tính man-day từ bản xem xét đăng ký',
        description:
            'Tạo bản tính man-day cấp dự án từ bản xem xét đăng ký đã được đánh giá viên xác nhận. Thao tác chạy lặp an toàn.',
    })
    @ApiParam({
        name: 'projectId',
        description: 'UUID dự án chứng nhận',
    })
    @ApiOkResponse({
        description: 'Bản tính hiện có hoặc bản tính vừa được đồng bộ',
    })
    syncFromReview(
        @Param('projectId')
        projectId: string,

        @Req()
        request: {
            user?: {
                id?: string;
                userId?: string;
                sub?: string;
            };
        },
    ) {
        return this.mandayCalculationsService.syncFromApplicationReview(
            projectId,
            this.getUserId(request),
        );
    }

    @Get('project/:projectId')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('mandays.read')
    @ApiOperation({
        summary: 'Lấy các bản tính man-day theo dự án',
    })
    @ApiParam({
        name: 'projectId',
        description: 'UUID dự án chứng nhận',
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
    })
    @ApiOkResponse({
        description: 'Các bản tính của dự án',
    })
    findByProject(
        @Param('projectId')
        projectId: string,
    ) {
        return this.mandayCalculationsService.findByProject(
            projectId,
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('mandays.read')
    @ApiOperation({
        summary: 'Lấy chi tiết bản tính man-day',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID bản tính man-day',
    })
    @ApiOkResponse({
        description: 'Chi tiết bản tính và các yếu tố điều chỉnh',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy bản tính',
    })
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.mandayCalculationsService.findOne(id);
    }

    @Patch(':id')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('mandays.manage')
    @ApiOperation({
        summary: 'Cập nhật bản tính man-day',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID bản tính man-day',
    })
    @ApiOkResponse({
        description: 'Cập nhật bản tính thành công',
    })
    update(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateMandayCalculationDto,
    ) {
        return this.mandayCalculationsService.update(
            id,
            dto,
        );
    }

    @Post(':id/approve')
    @Roles('ADMIN')
    @Permissions('mandays.approve')
    @ApiOperation({
        summary: 'Phê duyệt bản tính man-day',
        description: 'Xác nhận bản tính bằng tài khoản người phê duyệt.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID bản tính man-day',
    })
    @ApiOkResponse({
        description: 'Bản tính đã được phê duyệt',
    })
    approve(
        @Param('id')
        id: string,

        @Req()
        request: {
            user?: {
                id?: string;
                userId?: string;
                sub?: string;
            };
        },
    ) {
        return this.mandayCalculationsService.approve(
            id,
            this.getUserId(request),
        );
    }

    @Delete(':id')
    @Roles('ADMIN')
    @Permissions('mandays.manage')
    @ApiOperation({
        summary: 'Xóa bản tính man-day chưa sử dụng',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID bản tính man-day',
    })
    @ApiOkResponse({
        description: 'Đã xóa bản tính',
    })
    remove(
        @Param('id')
        id: string,
    ) {
        return this.mandayCalculationsService.remove(id);
    }
}

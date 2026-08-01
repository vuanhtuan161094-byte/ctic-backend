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

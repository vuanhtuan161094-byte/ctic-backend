import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
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

import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import { ExpertsService } from './experts.service';

@Controller('experts')
@ApiTags('20. Chuyên gia')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class ExpertsController {
    constructor(
        private readonly expertsService:
            ExpertsService,
    ) { }

    @Get()
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('experts.read')
    @ApiOperation({
        summary: 'Lấy danh sách chuyên gia',
    })
    @ApiQuery({
        name: 'search',
        required: false,
        description: 'Tìm theo tên, email hoặc số điện thoại',
    })
    @ApiQuery({
        name: 'status',
        required: false,
        enum: [
            'active',
            'inactive',
        ],
        description: 'Lọc theo trạng thái',
    })
    @ApiOkResponse({
        description: 'Danh sách chuyên gia',
    })
    findAll(
        @Query('search')
        search?: string,

        @Query('status')
        status?: string,
    ): Promise<unknown> {
        return this.expertsService.findAll(
            search,
            status,
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('experts.read')
    @ApiOperation({
        summary: 'Lấy hồ sơ chi tiết chuyên gia',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chuyên gia',
        example: '2130f4b2-b4e6-4bcb-be7c-809c60b8f341',
    })
    @ApiOkResponse({
        description: 'Hồ sơ và năng lực chuyên gia',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy chuyên gia',
    })
    findOne(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.expertsService.findOne(id);
    }

    @Post()
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({
        summary: 'Tạo hồ sơ chuyên gia',
    })
    @ApiCreatedResponse({
        description: 'Tạo chuyên gia thành công',
    })
    @ApiConflictResponse({
        description: 'Email chuyên gia đã tồn tại',
    })
    create(
        @Body()
        dto: CreateExpertDto,
    ): Promise<unknown> {
        return this.expertsService.create(dto);
    }

    @Patch(':id')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({
        summary: 'Cập nhật hồ sơ chuyên gia',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chuyên gia',
    })
    @ApiOkResponse({
        description: 'Cập nhật chuyên gia thành công',
    })
    update(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Body()
        dto: UpdateExpertDto,
    ): Promise<unknown> {
        return this.expertsService.update(
            id,
            dto,
        );
    }

    @Delete(':id')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({
        summary: 'Ngừng hoạt động chuyên gia',
        description: 'Chuyển trạng thái sang inactive, không xóa dữ liệu.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chuyên gia',
    })
    @ApiOkResponse({
        description: 'Chuyên gia đã ngừng hoạt động',
    })
    @ApiBadRequestResponse({
        description: 'Chuyên gia đang được sử dụng hoặc không thể ngừng hoạt động',
    })
    deactivate(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.expertsService.deactivate(id);
    }
}

import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';

import type {
    Request,
} from 'express';

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

import { CreateExpertCompetencyDto } from './dto/create-expert-competency.dto';
import { SuspendExpertCompetencyDto } from './dto/suspend-expert-competency.dto';
import { UpdateExpertCompetencyDto } from './dto/update-expert-competency.dto';
import { ExpertCompetenciesService } from './expert-competencies.service';

type AuthenticatedRequest =
    Request & {
        user: {
            userId: string;
            username: string;
            roles: string[];
            permissions?: string[];
        };
    };

@Controller('expert-competencies')
@ApiTags('21. Năng lực chuyên gia')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class ExpertCompetenciesController {
    constructor(
        private readonly service:
            ExpertCompetenciesService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Tạo hồ sơ năng lực chuyên gia' })
    @ApiCreatedResponse({ description: 'Đã tạo hồ sơ năng lực' })
    @ApiBadRequestResponse({ description: 'Dữ liệu năng lực không hợp lệ' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    create(
        @Body()
        dto: CreateExpertCompetencyDto,
    ): Promise<unknown> {
        return this.service.create(dto);
    }

    @Get()
    @ApiOperation({ summary: 'Lấy danh sách năng lực chuyên gia' })
    @ApiQuery({ name: 'expert_id', required: false, format: 'uuid' })
    @ApiQuery({ name: 'management_system', required: false, example: 'EMS' })
    @ApiQuery({ name: 'role', required: false, example: 'AUDITOR' })
    @ApiQuery({ name: 'status', required: false, example: 'APPROVED' })
    @ApiQuery({ name: 'iaf_code', required: false, example: '14' })
    @ApiQuery({ name: 'nace_code', required: false, example: '22.29' })
    @ApiOkResponse({ description: 'Danh sách năng lực chuyên gia' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('competencies.read')
    findAll(
        @Query('expert_id')
        expertId?: string,

        @Query('management_system')
        managementSystem?: string,

        @Query('role')
        role?: string,

        @Query('status')
        status?: string,

        @Query('iaf_code')
        iafCode?: string,

        @Query('nace_code')
        naceCode?: string,
    ): Promise<unknown> {
        return this.service.findAll(
            expertId,
            managementSystem,
            role,
            status,
            iafCode,
            naceCode,
        );
    }

    @Get('expert/:expertId')
    @ApiOperation({ summary: 'Lấy năng lực của một chuyên gia' })
    @ApiParam({ name: 'expertId', format: 'uuid' })
    @ApiOkResponse({ description: 'Danh sách năng lực của chuyên gia' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('competencies.read')
    findByExpert(
        @Param(
            'expertId',
            ParseUUIDPipe,
        )
        expertId: string,
    ): Promise<unknown> {
        return this.service.findByExpert(
            expertId,
        );
    }

    @Get(':id')
    @ApiOperation({ summary: 'Lấy chi tiết hồ sơ năng lực' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Chi tiết hồ sơ năng lực' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ năng lực' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('competencies.read')
    findOne(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.service.findOne(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Cập nhật hồ sơ năng lực' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã cập nhật hồ sơ năng lực' })
    @ApiBadRequestResponse({ description: 'Dữ liệu cập nhật không hợp lệ' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ năng lực' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    update(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Body()
        dto: UpdateExpertCompetencyDto,
    ): Promise<unknown> {
        return this.service.update(
            id,
            dto,
        );
    }

    @Post(':id/approve')
    @ApiOperation({ summary: 'Phê duyệt năng lực bằng tài khoản hiện tại' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã phê duyệt hồ sơ năng lực' })
    @ApiBadRequestResponse({ description: 'Hồ sơ không đủ điều kiện phê duyệt' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ năng lực' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    approve(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.approve(
            id,
            request.user.userId,
        );
    }

    @Post(':id/suspend')
    @ApiOperation({ summary: 'Tạm đình chỉ năng lực chuyên gia' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã đình chỉ hồ sơ năng lực' })
    @ApiBadRequestResponse({ description: 'Không thể đình chỉ hồ sơ năng lực' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ năng lực' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    suspend(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Body()
        dto: SuspendExpertCompetencyDto,
    ): Promise<unknown> {
        return this.service.suspend(
            id,
            dto,
        );
    }
}

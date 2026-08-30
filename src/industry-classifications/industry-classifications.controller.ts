import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
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

import {
    CreateIafScopeDto,
    CreateIndustryClassificationDto,
    CreateIndustryCodeMappingDto,
    CreateNaceIafMappingDto,
} from './dto/industry-classification.dto';

import { IndustryClassificationsService } from './industry-classifications.service';

type AuthenticatedRequest =
    Request & {
        user: {
            userId: string;
            username: string;
            roles: string[];
            permissions?: string[];
        };
    };

@Controller('industry-classifications')
@ApiTags('22. Danh mục ISIC, NACE và IAF')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class IndustryClassificationsController {
    constructor(
        private readonly service:
            IndustryClassificationsService,
    ) { }

    @Get('summary')
    @ApiOperation({ summary: 'Tổng quan dữ liệu ISIC, NACE, IAF và mức phủ ánh xạ' })
    @ApiOkResponse({ description: 'Số lượng danh mục, ánh xạ và nguồn tham chiếu' })
    @Roles('ADMIN', 'COORDINATOR', 'TECHNICAL_REVIEWER')
    @Permissions('classifications.read')
    summary(): Promise<unknown> {
        return this.service.getSummary();
    }

    @Post('codes')
    @ApiOperation({ summary: 'Tạo mã phân loại ISIC hoặc NACE' })
    @ApiCreatedResponse({ description: 'Đã tạo mã phân loại' })
    @ApiBadRequestResponse({ description: 'Dữ liệu mã phân loại không hợp lệ' })
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    createCode(
        @Body()
        dto: CreateIndustryClassificationDto,
    ): Promise<unknown> {
        return this.service.createClassification(
            dto,
        );
    }

    @Get('codes')
    @ApiOperation({ summary: 'Tra cứu danh mục ISIC và NACE' })
    @ApiQuery({ name: 'classification_type', required: false, enum: ['ISIC', 'NACE'] })
    @ApiQuery({ name: 'revision', required: false, example: 'ISIC_REV_4' })
    @ApiQuery({ name: 'search', required: false, example: '2220' })
    @ApiQuery({ name: 'active', required: false, enum: ['true', 'false'] })
    @ApiOkResponse({ description: 'Danh sách mã phân loại' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('classifications.read')
    findCodes(
        @Query('classification_type')
        classificationType?: string,

        @Query('revision')
        revision?: string,

        @Query('search')
        search?: string,

        @Query('active')
        active?: string,
    ): Promise<unknown> {
        return this.service.findClassifications(
            classificationType,
            revision,
            search,
            active,
        );
    }

    @Post('mappings')
    @ApiOperation({ summary: 'Tạo ánh xạ giữa mã ISIC và NACE' })
    @ApiCreatedResponse({ description: 'Đã tạo ánh xạ mã ngành' })
    @ApiBadRequestResponse({ description: 'Dữ liệu ánh xạ không hợp lệ' })
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    createMapping(
        @Body()
        dto: CreateIndustryCodeMappingDto,
    ): Promise<unknown> {
        return this.service.createIndustryMapping(
            dto,
        );
    }

    @Get('mappings')
    @ApiOperation({ summary: 'Lấy danh sách ánh xạ ISIC–NACE' })
    @ApiQuery({ name: 'source_code_id', required: false, format: 'uuid' })
    @ApiQuery({ name: 'target_code_id', required: false, format: 'uuid' })
    @ApiQuery({ name: 'status', required: false, example: 'APPROVED' })
    @ApiOkResponse({ description: 'Danh sách ánh xạ mã ngành' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('classifications.read')
    findMappings(
        @Query('source_code_id')
        sourceCodeId?: string,

        @Query('target_code_id')
        targetCodeId?: string,

        @Query('status')
        status?: string,
    ): Promise<unknown> {
        return this.service.findIndustryMappings(
            sourceCodeId,
            targetCodeId,
            status,
        );
    }

    @Post('mappings/:id/approve')
    @ApiOperation({ summary: 'Phê duyệt ánh xạ ISIC–NACE bằng tài khoản hiện tại' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã phê duyệt ánh xạ mã ngành' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy ánh xạ mã ngành' })
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    approveMapping(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.approveIndustryMapping(
            id,
            request.user.userId,
        );
    }

    @Post('iaf-scopes')
    @ApiOperation({ summary: 'Tạo phạm vi công nhận IAF' })
    @ApiCreatedResponse({ description: 'Đã tạo phạm vi IAF' })
    @ApiBadRequestResponse({ description: 'Dữ liệu phạm vi IAF không hợp lệ' })
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    createIafScope(
        @Body()
        dto: CreateIafScopeDto,
    ): Promise<unknown> {
        return this.service.createIafScope(dto);
    }

    @Get('iaf-scopes')
    @ApiOperation({ summary: 'Tra cứu danh mục phạm vi IAF' })
    @ApiQuery({ name: 'active', required: false, enum: ['true', 'false'] })
    @ApiQuery({ name: 'search', required: false, example: '14' })
    @ApiOkResponse({ description: 'Danh sách phạm vi IAF' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('classifications.read')
    findIafScopes(
        @Query('active')
        active?: string,

        @Query('search')
        search?: string,
    ): Promise<unknown> {
        return this.service.findIafScopes(
            active,
            search,
        );
    }

    @Post('nace-iaf-mappings')
    @ApiOperation({ summary: 'Tạo ánh xạ NACE–IAF theo hệ thống quản lý' })
    @ApiCreatedResponse({ description: 'Đã tạo ánh xạ NACE–IAF' })
    @ApiBadRequestResponse({ description: 'Dữ liệu ánh xạ không hợp lệ' })
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    createNaceIafMapping(
        @Body()
        dto: CreateNaceIafMappingDto,
    ): Promise<unknown> {
        return this.service.createNaceIafMapping(
            dto,
        );
    }

    @Get('nace-iaf-mappings')
    @ApiOperation({ summary: 'Lấy danh sách ánh xạ NACE–IAF' })
    @ApiQuery({ name: 'nace_code_id', required: false, format: 'uuid' })
    @ApiQuery({ name: 'iaf_scope_id', required: false, format: 'uuid' })
    @ApiQuery({ name: 'management_system', required: false, example: 'EMS' })
    @ApiQuery({ name: 'status', required: false, example: 'APPROVED' })
    @ApiOkResponse({ description: 'Danh sách ánh xạ NACE–IAF' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('classifications.read')
    findNaceIafMappings(
        @Query('nace_code_id')
        naceCodeId?: string,

        @Query('iaf_scope_id')
        iafScopeId?: string,

        @Query('management_system')
        managementSystem?: string,

        @Query('status')
        status?: string,
    ): Promise<unknown> {
        return this.service.findNaceIafMappings(
            naceCodeId,
            iafScopeId,
            managementSystem,
            status,
        );
    }

    @Post('nace-iaf-mappings/:id/approve')
    @ApiOperation({ summary: 'Phê duyệt ánh xạ NACE–IAF bằng tài khoản hiện tại' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã phê duyệt ánh xạ NACE–IAF' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy ánh xạ NACE–IAF' })
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    approveNaceIafMapping(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.approveNaceIafMapping(
            id,
            request.user.userId,
        );
    }

    @Get('mapping-coverage')
    @ApiOperation({ summary: 'Kiểm tra độ phủ ISIC → NACE → IAF theo hệ thống quản lý' })
    @ApiQuery({ name: 'management_system', required: true, example: 'QMS' })
    @ApiOkResponse({ description: 'Độ phủ ánh xạ và danh sách mã chưa phân giải (nếu có)' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('classifications.read')
    getMappingCoverage(
        @Query('management_system')
        managementSystem: string,
    ): Promise<unknown> {
        return this.service.getMappingCoverage(
            managementSystem,
        );
    }

    @Get('resolve')
    @ApiOperation({ summary: 'Xác định NACE và IAF từ mã ngành đầu vào' })
    @ApiQuery({ name: 'classification_type', required: true, enum: ['ISIC', 'NACE'] })
    @ApiQuery({ name: 'revision', required: true, example: 'ISIC_REV_4' })
    @ApiQuery({ name: 'code', required: true, example: '2220' })
    @ApiQuery({ name: 'management_system', required: true, example: 'EMS' })
    @ApiOkResponse({ description: 'Kết quả phân giải ISIC/NACE/IAF' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy mã hoặc ánh xạ phù hợp' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('classifications.read')
    resolve(
        @Query('classification_type')
        classificationType: string,

        @Query('revision')
        revision: string,

        @Query('code')
        code: string,

        @Query('management_system')
        managementSystem: string,
    ): Promise<unknown> {
        return this.service.resolve(
            classificationType,
            revision,
            code,
            managementSystem,
        );
    }
}

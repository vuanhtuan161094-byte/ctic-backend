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

import { CertificationProjectScopesService } from './certification-project-scopes.service';
import { CreateCertificationProjectScopeDto } from './dto/create-certification-project-scope.dto';

type AuthenticatedRequest =
    Request & {
        user: {
            userId: string;
            username: string;
            roles: string[];
            permissions?: string[];
        };
    };

@Controller('certification-project-scopes')
@ApiTags('23. Phạm vi ngành của dự án')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class CertificationProjectScopesController {
    constructor(
        private readonly service:
            CertificationProjectScopesService,
    ) { }

    @Post()
    @ApiOperation({ summary: 'Gắn phạm vi ISIC/NACE/IAF vào dự án' })
    @ApiCreatedResponse({ description: 'Đã gắn phạm vi ngành vào dự án' })
    @ApiBadRequestResponse({ description: 'Dữ liệu phạm vi hoặc ánh xạ không hợp lệ' })
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
    )
    @Permissions('projects.manage')
    create(
        @Body()
        dto: CreateCertificationProjectScopeDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.create(
            dto,
            request.user.userId,
        );
    }

    @Get('project/:projectId')
    @ApiOperation({ summary: 'Lấy các phạm vi ngành của dự án' })
    @ApiParam({ name: 'projectId', format: 'uuid' })
    @ApiQuery({ name: 'status', required: false, example: 'APPROVED' })
    @ApiOkResponse({ description: 'Danh sách phạm vi ngành của dự án' })
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('projects.read')
    findByProject(
        @Param(
            'projectId',
            ParseUUIDPipe,
        )
        projectId: string,

        @Query('status')
        status?: string,
    ): Promise<unknown> {
        return this.service.findByProject(
            projectId,
            status,
        );
    }

    @Post('project/:projectId/sync-from-review')
    @ApiOperation({ summary: 'Đồng bộ phạm vi dự án từ bản xem xét đơn đã hoàn tất' })
    @ApiParam({ name: 'projectId', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã đồng bộ và phê duyệt phạm vi ngành của dự án' })
    @ApiBadRequestResponse({ description: 'Bản xem xét chưa có phạm vi ngành hợp lệ' })
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
    )
    @Permissions('projects.manage')
    syncFromReview(
        @Param(
            'projectId',
            ParseUUIDPipe,
        )
        projectId: string,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.syncFromReview(
            projectId,
            request.user.userId,
        );
    }

    @Get(':id')
    @ApiOperation({ summary: 'Lấy chi tiết phạm vi ngành của dự án' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Chi tiết phạm vi ngành' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy phạm vi ngành' })
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('projects.read')
    findOne(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.service.findOne(id);
    }

    @Post(':id/approve')
    @ApiOperation({ summary: 'Phê duyệt phạm vi dự án bằng tài khoản hiện tại' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã phê duyệt phạm vi dự án' })
    @ApiBadRequestResponse({ description: 'Phạm vi không đủ điều kiện phê duyệt' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy phạm vi ngành' })
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('technical_reviews.perform')
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
}

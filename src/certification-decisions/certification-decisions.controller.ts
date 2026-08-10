import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Req,
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

import { CertificationDecisionsService } from './certification-decisions.service';
import { CreateCertificationDecisionDto } from './dto/create-certification-decision.dto';

@Controller('certification-decisions')
@ApiTags('16. Quyết định chứng nhận')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class CertificationDecisionsController {
    constructor(
        private readonly certificationDecisionsService:
            CertificationDecisionsService,
        private readonly resourceAccess:
            ResourceAccessService,
    ) { }

    @Post()
    @Roles(
        'ADMIN',
        'DECISION_MAKER',
    )
    @Permissions('certification_decisions.issue')
    @ApiOperation({
        summary: 'Ban hành quyết định chứng nhận F.13-P.09',
        description: 'Ghi nhận quyết định bằng tài khoản người ra quyết định.',
    })
    @ApiCreatedResponse({
        description: 'Đã ban hành quyết định chứng nhận',
    })
    @ApiBadRequestResponse({
        description: 'Hồ sơ thẩm xét chưa hoàn thành hoặc dữ liệu quyết định không hợp lệ',
    })
    @ApiConflictResponse({
        description: 'Hồ sơ thẩm xét hoặc số quyết định đã được sử dụng',
    })
    create(
        @Body()
        dto: CreateCertificationDecisionDto,

        @Req()
        request: SecurityRequest,
    ) {
        const createdBy =
            request.user?.userId ??
            request.user?.id ??
            request.user?.sub;

        return this.certificationDecisionsService.create(
            dto,
            createdBy,
        );
    }

    @Get()
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('certification_decisions.read')
    @ApiOperation({
        summary: 'Lấy danh sách quyết định chứng nhận',
    })
    @ApiOkResponse({
        description: 'Danh sách quyết định chứng nhận',
    })
    async findAll(
        @Req()
        request: SecurityRequest,
    ) {
        const decisions =
            await this.certificationDecisionsService.findAll();

        const scoped =
            await this.resourceAccess.filterEntities(
                decisions.map((decision) => ({
                    ...decision,
                    entity_type: 'certification_decision',
                    entity_id: decision.id,
                })),
                getResourceActor(request),
            );

        return scoped.map(({
            entity_type: _entityType,
            entity_id: _entityId,
            ...decision
        }) => decision);
    }

    @Get('technical-review/:technicalReviewId')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('certification_decisions.read')
    @ApiOperation({
        summary: 'Lấy quyết định theo hồ sơ thẩm xét',
    })
    @ApiParam({
        name: 'technicalReviewId',
        description: 'UUID hồ sơ thẩm xét kỹ thuật',
        example: '5389468f-a200-40fd-a2d2-4ca8c0db14a3',
    })
    @ApiOkResponse({
        description: 'Quyết định của hồ sơ thẩm xét',
    })
    async findByTechnicalReview(
        @Param('technicalReviewId')
        technicalReviewId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'technical_review',
                entity_id: technicalReviewId,
            },
            getResourceActor(request),
        );

        return this.certificationDecisionsService
            .findByTechnicalReview(
                technicalReviewId,
            );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('certification_decisions.read')
    @ApiOperation({
        summary: 'Lấy chi tiết quyết định chứng nhận',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID quyết định chứng nhận',
        example: '1f2818f8-fde5-463e-a7f8-828b18ffd7a5',
    })
    @ApiOkResponse({
        description: 'Chi tiết quyết định và hồ sơ thẩm xét liên quan',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy quyết định',
    })
    async findOne(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'certification_decision',
                entity_id: id,
            },
            getResourceActor(request),
        );

        return this.certificationDecisionsService.findOne(
            id,
        );
    }
}

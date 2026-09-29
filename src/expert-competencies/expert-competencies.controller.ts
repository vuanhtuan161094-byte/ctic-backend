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
import type { Request } from 'express';
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
import { CreateExpertCompetencyEvidenceDto } from './dto/create-expert-competency-evidence.dto';
import { CreateExpertCompetencyReviewDto } from './dto/create-expert-competency-review.dto';
import { ReactivateExpertCompetencyDto } from './dto/reactivate-expert-competency.dto';
import { RenewExpertCompetencyDto } from './dto/renew-expert-competency.dto';
import { SuspendExpertCompetencyDto } from './dto/suspend-expert-competency.dto';
import { UpdateExpertCompetencyDto } from './dto/update-expert-competency.dto';
import { VoidExpertCompetencyEvidenceDto } from './dto/void-expert-competency-evidence.dto';
import { ExpertCompetenciesService } from './expert-competencies.service';
import { CreateOwnCompetencyDto, ReturnCompetencyDto } from './dto/competency-submission.dto';
import { BatchCompetencyDto, OwnBatchCompetencyDto } from './dto/batch-competency.dto';

type AuthenticatedRequest = Request & {
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
        private readonly service: ExpertCompetenciesService,
    ) { }

    // Self routes use authenticated experts.user_id ownership, not global permissions.
    @Get('me/iaf-scopes')
    ownIafCatalog(@Req() request: AuthenticatedRequest) { return this.service.ownIafCatalog(request.user.userId); }

    @Post('me/batch')
    createOwnBatch(@Body() dto: OwnBatchCompetencyDto, @Req() request: AuthenticatedRequest) { return this.service.createOwnBatch(dto, request.user.userId); }

    @Post('batch')
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    createBatch(@Body() dto: BatchCompetencyDto, @Req() request: AuthenticatedRequest) { return this.service.createBatch(dto, request.user.userId); }

    @Get('me')
    findOwn(@Req() request: AuthenticatedRequest) {
        return this.service.findOwn(request.user.userId);
    }

    @Post('me')
    createOwn(@Body() dto: CreateOwnCompetencyDto, @Req() request: AuthenticatedRequest) {
        return this.service.createOwn(dto, request.user.userId);
    }

    @Patch('me/:id')
    updateOwn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpertCompetencyDto, @Req() request: AuthenticatedRequest) {
        return this.service.updateOwn(id, dto, request.user.userId);
    }

    @Post('me/:id/evidence')
    addOwnEvidence(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateExpertCompetencyEvidenceDto, @Req() request: AuthenticatedRequest) {
        return this.service.addOwnEvidence(id, dto, request.user.userId);
    }

    @Post('me/:id/submit')
    submitOwn(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
        return this.service.submitOwn(id, request.user.userId);
    }

    @Post(':id/submit')
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    submit(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthenticatedRequest) {
        return this.service.submit(id, request.user.userId);
    }

    @Post(':id/return')
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    returnSubmission(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnCompetencyDto, @Req() request: AuthenticatedRequest) {
        return this.service.returnSubmission(id, request.user.userId, dto.reason);
    }

    @Post()
    @ApiOperation({ summary: 'Tạo hồ sơ năng lực chuyên gia' })
    @ApiCreatedResponse({ description: 'Đã tạo hồ sơ năng lực' })
    @ApiBadRequestResponse({ description: 'Dữ liệu năng lực không hợp lệ' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    create(
        @Body() dto: CreateExpertCompetencyDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.create(
            dto,
            request.user.userId,
        );
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
        @Query('expert_id') expertId?: string,
        @Query('management_system') managementSystem?: string,
        @Query('role') role?: string,
        @Query('status') status?: string,
        @Query('iaf_code') iafCode?: string,
        @Query('nace_code') naceCode?: string,
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
        @Param('expertId', ParseUUIDPipe) expertId: string,
    ): Promise<unknown> {
        return this.service.findByExpert(expertId);
    }

    @Get(':id')
    @ApiOperation({
        summary: 'Lấy chi tiết năng lực, bằng chứng, tái đánh giá và lịch sử quyết định',
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Chi tiết quản trị năng lực' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ năng lực' })
    @Roles(
        'ADMIN',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('competencies.read')
    findOne(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<unknown> {
        return this.service.findOne(id);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Cập nhật hồ sơ năng lực ở trạng thái dự thảo' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã cập nhật hồ sơ năng lực' })
    @ApiBadRequestResponse({ description: 'Dữ liệu cập nhật không hợp lệ' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ năng lực' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateExpertCompetencyDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.update(
            id,
            dto,
            request.user.userId,
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
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request: AuthenticatedRequest,
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
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: SuspendExpertCompetencyDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.suspend(
            id,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/reactivate')
    @ApiOperation({ summary: 'Khôi phục năng lực đang bị đình chỉ' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    reactivate(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ReactivateExpertCompetencyDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.reactivate(
            id,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/renew')
    @ApiOperation({ summary: 'Gia hạn hiệu lực năng lực và ghi lịch sử quyết định' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    renew(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RenewExpertCompetencyDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.renew(
            id,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/evidence')
    @ApiOperation({ summary: 'Thêm bằng chứng năng lực có cấu trúc' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    addEvidence(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateExpertCompetencyEvidenceDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.addEvidence(
            id,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/evidence/:evidenceId/void')
    @ApiOperation({ summary: 'Vô hiệu bằng chứng nhưng giữ nguyên audit trail' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiParam({ name: 'evidenceId', format: 'uuid' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    voidEvidence(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
        @Body() dto: VoidExpertCompetencyEvidenceDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.voidEvidence(
            id,
            evidenceId,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/reviews')
    @ApiOperation({ summary: 'Ghi nhận kết quả tái đánh giá/giám sát năng lực' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @Roles('ADMIN')
    @Permissions('competencies.manage')
    addReview(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateExpertCompetencyReviewDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.service.addReview(
            id,
            dto,
            request.user.userId,
        );
    }
}

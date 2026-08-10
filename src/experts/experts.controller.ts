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
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreateExpertCertificateDto } from './dto/create-expert-certificate.dto';
import { CreateExpertWorkExperienceDto } from './dto/create-expert-work-experience.dto';
import { CreateExpertDto } from './dto/create-expert.dto';
import { SuspendExpertProfileDto } from './dto/suspend-expert-profile.dto';
import { UpdateExpertCertificateDto } from './dto/update-expert-certificate.dto';
import { UpdateExpertWorkExperienceDto } from './dto/update-expert-work-experience.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import { ExpertsService } from './experts.service';

interface AuthenticatedRequest extends Request {
    user: {
        userId: string;
        username: string;
        roles: string[];
    };
}

@Controller('experts')
@ApiTags('20. Chuyên gia')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ExpertsController {
    constructor(
        private readonly expertsService: ExpertsService,
    ) {}

    @Get()
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('experts.read')
    @ApiOperation({ summary: 'Lấy danh sách chuyên gia' })
    @ApiQuery({ name: 'search', required: false })
    @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
    findAll(
        @Query('search') search?: string,
        @Query('status') status?: string,
    ): Promise<unknown> {
        return this.expertsService.findAll(search, status);
    }

    @Get('overview')
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('experts.read')
    @ApiOperation({ summary: 'Lấy tổng quan hồ sơ và năng lực chuyên gia' })
    getOverview(): Promise<unknown> {
        return this.expertsService.getOverview();
    }

    @Get('account-options')
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('experts.read')
    @ApiOperation({ summary: 'Lấy danh sách tài khoản để liên kết chuyên gia' })
    getAccountOptions(): Promise<unknown> {
        return this.expertsService.getAccountOptions();
    }

    @Get('recommendations')
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('experts.read')
    @ApiOperation({
        summary: 'Đối chiếu chuyên gia theo kế hoạch, vai trò, phạm vi và lịch',
    })
    @ApiQuery({ name: 'plan_id', required: true })
    @ApiQuery({
        name: 'team_role',
        required: true,
        enum: ['TEAM_LEADER', 'AUDITOR', 'TECHNICAL_EXPERT', 'WITNESS_EVALUATOR'],
    })
    recommendForPlan(
        @Query('plan_id') planId: string,
        @Query('team_role') teamRole: string,
    ): Promise<unknown> {
        return this.expertsService.recommendForPlan(planId, teamRole);
    }

    @Post()
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Tạo hồ sơ chuyên gia gắn với tài khoản' })
    @ApiCreatedResponse({ description: 'Tạo chuyên gia thành công' })
    create(@Body() dto: CreateExpertDto): Promise<unknown> {
        return this.expertsService.create(dto);
    }

    @Post(':id/approve')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Phê duyệt hồ sơ chuyên gia' })
    approveProfile(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.approveProfile(id, request.user.userId);
    }

    @Post(':id/suspend')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Tạm đình chỉ hồ sơ chuyên gia' })
    suspendProfile(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: SuspendExpertProfileDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.suspendProfile(
            id,
            request.user.userId,
            dto.reason,
        );
    }

    @Post(':id/work-experiences')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Thêm kinh nghiệm công việc chuyên gia' })
    createWorkExperience(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateExpertWorkExperienceDto,
    ): Promise<unknown> {
        return this.expertsService.createWorkExperience(id, dto);
    }

    @Patch(':id/work-experiences/:recordId')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Cập nhật kinh nghiệm công việc chuyên gia' })
    updateWorkExperience(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('recordId', ParseUUIDPipe) recordId: string,
        @Body() dto: UpdateExpertWorkExperienceDto,
    ): Promise<unknown> {
        return this.expertsService.updateWorkExperience(id, recordId, dto);
    }

    @Delete(':id/work-experiences/:recordId')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Xóa kinh nghiệm công việc chuyên gia' })
    deleteWorkExperience(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('recordId', ParseUUIDPipe) recordId: string,
    ): Promise<unknown> {
        return this.expertsService.deleteWorkExperience(id, recordId);
    }

    @Post(':id/certificates')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Thêm chứng chỉ chuyên gia' })
    createCertificate(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateExpertCertificateDto,
    ): Promise<unknown> {
        return this.expertsService.createCertificate(id, dto);
    }

    @Patch(':id/certificates/:certificateId')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Cập nhật chứng chỉ chuyên gia' })
    updateCertificate(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('certificateId', ParseUUIDPipe) certificateId: string,
        @Body() dto: UpdateExpertCertificateDto,
    ): Promise<unknown> {
        return this.expertsService.updateCertificate(id, certificateId, dto);
    }

    @Delete(':id/certificates/:certificateId')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Xóa chứng chỉ chuyên gia' })
    deleteCertificate(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('certificateId', ParseUUIDPipe) certificateId: string,
    ): Promise<unknown> {
        return this.expertsService.deleteCertificate(id, certificateId);
    }

    @Get(':id')
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('experts.read')
    @ApiOperation({ summary: 'Lấy hồ sơ chi tiết chuyên gia' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Hồ sơ chuyên gia' })
    findOne(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<unknown> {
        return this.expertsService.findOne(id);
    }

    @Patch(':id')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Cập nhật hồ sơ chuyên gia' })
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateExpertDto,
    ): Promise<unknown> {
        return this.expertsService.update(id, dto);
    }

    @Delete(':id')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Ngừng hoạt động chuyên gia' })
    deactivate(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<unknown> {
        return this.expertsService.deactivate(id);
    }
}

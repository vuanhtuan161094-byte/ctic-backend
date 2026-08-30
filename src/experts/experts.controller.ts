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

import { CancelExpertRecordDto } from './dto/cancel-expert-record.dto';
import { CompleteExpertMonitoringDto } from './dto/complete-expert-monitoring.dto';
import { CreateExpertMonitoringDto } from './dto/create-expert-monitoring.dto';
import { CreateExpertTrainingDto } from './dto/create-expert-training.dto';
import { EvaluateExpertTrainingDto } from './dto/evaluate-expert-training.dto';
import { CreateExpertCertificateDto } from './dto/create-expert-certificate.dto';
import { CreateExpertWorkExperienceDto } from './dto/create-expert-work-experience.dto';
import { CreateExpertDto } from './dto/create-expert.dto';
import { SuspendExpertProfileDto } from './dto/suspend-expert-profile.dto';
import { UpdateExpertCertificateDto } from './dto/update-expert-certificate.dto';
import { UpdateExpertWorkExperienceDto } from './dto/update-expert-work-experience.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import {
    CancelExpertResourceRecordDto,
    CreateExpertAvailabilityDto,
    CreateExpertCustomerConflictDto,
    ReviewExpertCustomerConflictDto,
} from './dto/expert-resource-governance.dto';
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

    @Get('resource-customers')
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('experts.read')
    @ApiOperation({ summary: 'Lấy khách hàng cho quản trị independence nội bộ' })
    getResourceCustomers(): Promise<unknown> {
        return this.expertsService.getResourceCustomers();
    }

    @Get('recommendations')
    @Roles('ADMIN', 'COORDINATOR')
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

    @Get(':id/development')
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('experts.read')
    @ApiOperation({ summary: 'Lấy hồ sơ đào tạo và giám sát năng lực chuyên gia' })
    getDevelopment(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<unknown> {
        return this.expertsService.getDevelopment(id);
    }

    @Post(':id/trainings')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Lập hoặc ghi nhận hồ sơ đào tạo chuyên gia' })
    createTraining(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateExpertTrainingDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.createTraining(id, dto, request.user.userId);
    }

    @Post(':id/trainings/:trainingId/evaluate')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Đánh giá hiệu quả sau đào tạo' })
    evaluateTraining(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('trainingId', ParseUUIDPipe) trainingId: string,
        @Body() dto: EvaluateExpertTrainingDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.evaluateTraining(
            id,
            trainingId,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/trainings/:trainingId/cancel')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Hủy kế hoạch đào tạo nhưng giữ lịch sử' })
    cancelTraining(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('trainingId', ParseUUIDPipe) trainingId: string,
        @Body() dto: CancelExpertRecordDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.cancelTraining(
            id,
            trainingId,
            dto.reason,
            request.user.userId,
        );
    }

    @Post(':id/monitoring')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Lập kế hoạch giám sát năng lực F.12' })
    createMonitoring(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateExpertMonitoringDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.createMonitoring(id, dto, request.user.userId);
    }

    @Post(':id/monitoring/:monitoringId/complete')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Hoàn tất giám sát năng lực / đánh giá chứng kiến F.09' })
    completeMonitoring(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('monitoringId', ParseUUIDPipe) monitoringId: string,
        @Body() dto: CompleteExpertMonitoringDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.completeMonitoring(
            id,
            monitoringId,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/monitoring/:monitoringId/cancel')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Hủy kế hoạch giám sát nhưng giữ lịch sử' })
    cancelMonitoring(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('monitoringId', ParseUUIDPipe) monitoringId: string,
        @Body() dto: CancelExpertRecordDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.cancelMonitoring(
            id,
            monitoringId,
            dto.reason,
            request.user.userId,
        );
    }

    @Get(':id/resource-governance')
    @Roles('ADMIN', 'COORDINATOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('experts.read')
    @ApiOperation({ summary: 'Lấy availability, workload và independence của chuyên gia' })
    @ApiQuery({ name: 'start_date', required: false })
    @ApiQuery({ name: 'end_date', required: false })
    getResourceGovernance(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request: AuthenticatedRequest,
        @Query('start_date') startDate?: string,
        @Query('end_date') endDate?: string,
    ): Promise<unknown> {
        const includeSensitiveDetails = request.user.roles.some(
            (role) => role.trim().toUpperCase() === 'ADMIN',
        );
        return this.expertsService.getResourceGovernance(
            id,
            startDate,
            endDate,
            includeSensitiveDetails,
        );
    }

    @Post(':id/availability')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Ghi nhận availability hoặc commitment của chuyên gia' })
    createAvailability(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateExpertAvailabilityDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.createAvailability(id, dto, request.user.userId);
    }

    @Post(':id/availability/:recordId/cancel')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Hủy lịch nguồn lực nhưng giữ lịch sử' })
    cancelAvailability(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('recordId', ParseUUIDPipe) recordId: string,
        @Body() dto: CancelExpertResourceRecordDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.cancelAvailability(
            id,
            recordId,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/conflicts')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Khai báo conflict of interest theo khách hàng' })
    declareConflict(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateExpertCustomerConflictDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.declareConflict(id, dto, request.user.userId);
    }

    @Post(':id/conflicts/:conflictId/review')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Ra quyết định independence cho conflict declaration' })
    reviewConflict(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('conflictId', ParseUUIDPipe) conflictId: string,
        @Body() dto: ReviewExpertCustomerConflictDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.reviewConflict(
            id,
            conflictId,
            dto,
            request.user.userId,
        );
    }

    @Post(':id/conflicts/:conflictId/cancel')
    @Roles('ADMIN')
    @Permissions('experts.manage')
    @ApiOperation({ summary: 'Hủy conflict declaration nhưng giữ lịch sử' })
    cancelConflict(
        @Param('id', ParseUUIDPipe) id: string,
        @Param('conflictId', ParseUUIDPipe) conflictId: string,
        @Body() dto: CancelExpertResourceRecordDto,
        @Req() request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.expertsService.cancelConflict(
            id,
            conflictId,
            dto,
            request.user.userId,
        );
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

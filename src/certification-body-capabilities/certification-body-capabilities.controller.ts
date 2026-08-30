import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CertificationBodyCapabilitiesService } from './certification-body-capabilities.service';
import {
    CreateCertificationBodyCapabilityBatchDto,
    CreateCertificationBodyCapabilityDto,
    UpdateCertificationBodyCapabilityDto,
} from './dto/certification-body-capability.dto';

type AuthenticatedRequest = { user?: { id?: string; userId?: string; sub?: string } };

@Controller('certification-body-capabilities')
@ApiTags('Năng lực tổ chức chứng nhận')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CertificationBodyCapabilitiesController {
    constructor(private readonly service: CertificationBodyCapabilitiesService) { }

    private userId(request: AuthenticatedRequest) {
        return request.user?.id ?? request.user?.userId ?? request.user?.sub ?? '';
    }

    @Get()
    @Roles('ADMIN', 'COORDINATOR', 'TECHNICAL_REVIEWER', 'APPROVER', 'CERTIFICATION_MANAGER')
    @Permissions('applications.read')
    findAll() {
        return this.service.findAll();
    }

    @Post()
    @Roles('ADMIN')
    @Permissions('applications.review')
    create(@Body() dto: CreateCertificationBodyCapabilityDto, @Req() request: AuthenticatedRequest) {
        return this.service.create(dto, this.userId(request));
    }

    @Post('batch')
    @Roles('ADMIN')
    @Permissions('applications.review')
    createBatch(@Body() dto: CreateCertificationBodyCapabilityBatchDto, @Req() request: AuthenticatedRequest) {
        return this.service.createBatch(dto, this.userId(request));
    }

    @Patch(':id')
    @Roles('ADMIN')
    @Permissions('applications.review')
    update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: UpdateCertificationBodyCapabilityDto,
        @Req() request: AuthenticatedRequest,
    ) {
        return this.service.update(id, dto, this.userId(request));
    }
}

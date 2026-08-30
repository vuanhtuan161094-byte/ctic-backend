import { Controller, Get, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SystemAdministrationPageQueryDto } from './dto/system-administration-query.dto';
import { SystemAdministrationService } from './system-administration.service';

@Controller('system-administration')
@ApiTags('System administration and governance')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN')
@Permissions('users.read')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class SystemAdministrationController {
    constructor(private readonly service: SystemAdministrationService) {}

    @Get('overview')
    overview() {
        return this.service.getOverview();
    }

    @Get('customer-access')
    customerAccess(@Query() query: SystemAdministrationPageQueryDto) {
        return this.service.getCustomerAccess(query);
    }

    @Get('notifications')
    notifications(@Query() query: SystemAdministrationPageQueryDto) {
        return this.service.getNotificationGovernance(query);
    }

    @Get('imports')
    imports(@Query() query: SystemAdministrationPageQueryDto) {
        return this.service.getImportGovernance(query);
    }

    @Get('document-governance')
    documentGovernance() {
        return this.service.getDocumentGovernance();
    }

    @Get('health')
    health() {
        return this.service.getDetailedHealth();
    }
}

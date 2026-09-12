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
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
    CreateNumberingSeriesDto,
    CreateSchemeConfigurationDto,
    CreateSchemeDto,
    CreateStandardEditionDto,
    ImportUploadDto,
    OrganizationProfileDto,
    UpdateSchemeDto,
    UpdateStandardEditionDto,
} from './dto/master-data-configuration.dto';
import { MasterDataConfigurationService } from './master-data-configuration.service';
import { StandardEditionLifecycleService } from './standard-edition-lifecycle.service';

type AuthRequest = { user: { userId?: string; id?: string; sub?: string } };
const INTERNAL_READ_ROLES = ['ADMIN', 'COORDINATOR', 'TECHNICAL_REVIEWER', 'AUDITOR', 'LEAD_AUDITOR', 'DECISION_MAKER'];

@Controller('master-data-configuration')
@ApiTags('Master data, configuration and import')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MasterDataConfigurationController {
    constructor(
        private readonly service: MasterDataConfigurationService,
        private readonly standardLifecycle: StandardEditionLifecycleService,
    ) { }

    private userId(request: AuthRequest) {
        return request.user.userId ?? request.user.id ?? request.user.sub ?? '';
    }

    @Get('schemes')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('classifications.read')
    listSchemes(@Query('search') search?: string, @Query('active_only') activeOnly?: string) {
        return this.service.listSchemes(search, activeOnly === 'true');
    }

    @Post('schemes')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    createScheme(@Body() dto: CreateSchemeDto, @Req() request: AuthRequest) {
        return this.service.createScheme(dto, this.userId(request));
    }

    @Patch('schemes/:id')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    updateScheme(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSchemeDto, @Req() request: AuthRequest) {
        return this.service.updateScheme(id, dto, this.userId(request));
    }

    @Get('standards')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('classifications.read')
    listStandards(@Query('search') search?: string, @Query('selectable') selectable?: string) {
        return this.service.listStandards(search, selectable === 'true');
    }

    @Post('standards')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    createStandard(@Body() dto: CreateStandardEditionDto, @Req() request: AuthRequest) {
        return this.service.createStandard(dto, this.userId(request));
    }

    @Patch('standards/:id')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    updateStandard(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStandardEditionDto, @Req() request: AuthRequest) {
        return this.service.updateStandard(id, dto, this.userId(request));
    }

    @Post('standards/:id/stop')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    stopStandard(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
        return this.standardLifecycle.stopStandardEdition(id, this.userId(request));
    }

    @Post('standards/:id/restore')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    restoreStandard(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
        return this.standardLifecycle.restoreStandardEdition(id, this.userId(request));
    }

    @Delete('standards/:id')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    deleteStandard(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
        return this.standardLifecycle.deleteStandardEdition(id, this.userId(request));
    }

    @Get('scheme-configurations')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('classifications.read')
    listConfigurations(@Query('scheme_id') schemeId?: string) {
        return this.service.listConfigurations(schemeId);
    }

    @Post('scheme-configurations')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    createConfiguration(@Body() dto: CreateSchemeConfigurationDto, @Req() request: AuthRequest) {
        return this.service.createConfiguration(dto, this.userId(request));
    }

    @Post('scheme-configurations/:id/activate')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    activateConfiguration(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
        return this.service.activateConfiguration(id, this.userId(request));
    }

    @Post('scheme-configurations/:id/cancel-scheduled')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    cancelScheduledConfiguration(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
        return this.service.cancelScheduledConfiguration(id, this.userId(request));
    }

    @Get('scheme-configurations/resolve')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('classifications.read')
    resolveConfiguration(@Query('scheme_code') schemeCode: string, @Query('at') at?: string) {
        return this.service.resolveConfiguration(schemeCode, at);
    }

    @Get('configuration-readiness')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('classifications.read')
    configurationReadiness() {
        return this.service.configurationReadiness();
    }

    @Get('organization-profile')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('classifications.read')
    getOrganizationProfile() {
        return this.service.getOrganizationProfile();
    }

    @Patch('organization-profile')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    saveOrganizationProfile(@Body() dto: OrganizationProfileDto, @Req() request: AuthRequest) {
        return this.service.saveOrganizationProfile(dto, this.userId(request));
    }

    @Get('numbering-series')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('classifications.read')
    listNumberingSeries() {
        return this.service.listNumberingSeries();
    }

    @Post('numbering-series')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    createNumberingSeries(@Body() dto: CreateNumberingSeriesDto, @Req() request: AuthRequest) {
        return this.service.createNumberingSeries(dto, this.userId(request));
    }

    @Get('imports/definitions')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    importDefinitions() {
        return this.service.importDefinitions();
    }

    @Get('imports')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    listImports() {
        return this.service.listImportJobs();
    }

    @Post('imports/validate')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
    validateImport(
        @Body() dto: ImportUploadDto,
        @UploadedFile() file: Express.Multer.File,
        @Req() request: AuthRequest,
    ) {
        return this.service.validateImport(dto.entity_type, dto.import_mode, file, this.userId(request));
    }

    @Get('imports/:id')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    getImport(@Param('id', ParseUUIDPipe) id: string) {
        return this.service.getImportJob(id);
    }

    @Post('imports/:id/commit')
    @Roles('ADMIN')
    @Permissions('classifications.manage')
    commitImport(@Param('id', ParseUUIDPipe) id: string, @Req() request: AuthRequest) {
        return this.service.commitImport(id, this.userId(request));
    }
}

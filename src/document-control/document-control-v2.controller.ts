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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getActorUserId } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import { DocumentLibraryService } from './document-library.service';
import { TemplateManagerService } from './template-manager.service';
import {
    AttachControlledFileDto,
    ControlledVoidDto,
    CreateDocumentLibraryRevisionDto,
    CreateDocumentLibrarySeriesDto,
    EffectiveDocumentLibraryVersionDto,
    RenderControlledTemplateDto,
    WorkflowNoteDto,
} from './dto/document-control.dto';

const READ_ROLES = [
    'ADMIN', 'STAFF', 'SALES', 'COORDINATOR', 'LEAD_AUDITOR', 'AUDITOR',
    'TECHNICAL_EXPERT', 'TECHNICAL_REVIEWER', 'DECISION_MAKER',
];
const CONTROL_ROLES = ['ADMIN', 'STAFF'];

@Controller('document-control/v2')
@ApiTags('15B. Tài liệu & Mẫu biểu V2')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DocumentControlV2Controller {
    constructor(
        private readonly library: DocumentLibraryService,
        private readonly templates: TemplateManagerService,
    ) {}

    private actor(request: SecurityRequest) {
        return { userId: getActorUserId(request), roles: request.user?.roles ?? [] };
    }

    @Get('library')
    @Roles(...READ_ROLES)
    @Permissions('documents.read')
    @ApiOperation({ summary: 'Danh mục tài liệu nội bộ/bên ngoài và toàn bộ phiên bản' })
    listLibrary(@Query('kind') kind?: string, @Query('search') search?: string) {
        return this.library.list(kind, search);
    }

    @Post('library')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    createLibrary(@Body() dto: CreateDocumentLibrarySeriesDto, @Req() request: SecurityRequest) {
        return this.library.create(dto, this.actor(request));
    }

    @Post('library/:id/revisions')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    createLibraryRevision(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateDocumentLibraryRevisionDto,
        @Req() request: SecurityRequest,
    ) {
        return this.library.createRevision(id, dto, this.actor(request));
    }

    @Post('library-versions/:id/file')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    attachLibraryFile(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AttachControlledFileDto,
        @Req() request: SecurityRequest,
    ) {
        return this.library.attachFile(id, dto.file_id, this.actor(request));
    }

    @Post('library-versions/:id/submit-review')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    submitLibraryReview(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.library.submitReview(id, dto, this.actor(request));
    }

    @Post('library-versions/:id/review')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    reviewLibrary(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.library.review(id, dto, this.actor(request));
    }

    @Post('library-versions/:id/approve')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    approveLibrary(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.library.approve(id, dto, this.actor(request));
    }

    @Post('library-versions/:id/effective')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    makeLibraryEffective(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: EffectiveDocumentLibraryVersionDto,
        @Req() request: SecurityRequest,
    ) {
        return this.library.makeEffective(id, dto, this.actor(request));
    }

    @Post('library-versions/:id/import-effective')
    @Roles('ADMIN')
    @Permissions('documents.manage')
    @ApiOperation({ summary: 'Nhập phiên bản nội bộ đầu tiên đã có hiệu lực trước khi sử dụng CMP' })
    importExistingLibraryVersion(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: EffectiveDocumentLibraryVersionDto,
        @Req() request: SecurityRequest,
    ) {
        return this.library.importExistingEffective(id, dto, this.actor(request));
    }

    @Post('library-versions/:id/withdraw')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    withdrawLibrary(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ControlledVoidDto,
        @Req() request: SecurityRequest,
    ) {
        return this.library.withdraw(id, dto, this.actor(request));
    }

    @Get('template-contexts')
    @Roles(...READ_ROLES)
    @Permissions('documents.read')
    searchTemplateContexts(@Query('type') type: string, @Query('search') search?: string) {
        return this.templates.searchContexts(type, search);
    }

    @Get('template-fields')
    @Roles(...READ_ROLES)
    @Permissions('documents.read')
    fieldCatalog() {
        return this.templates.fieldCatalog();
    }

    @Post('template-versions/:id/validate')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    validateTemplate(@Param('id', ParseUUIDPipe) id: string) {
        return this.templates.validateTemplateVersion(id);
    }

    @Post('template-versions/:id/preview-data')
    @Roles(...READ_ROLES)
    @Permissions('documents.read')
    previewTemplateData(
        @Param('id', ParseUUIDPipe) _id: string,
        @Body() dto: RenderControlledTemplateDto,
    ) {
        return this.templates.previewData(dto);
    }

    @Post('template-versions/:id/render')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR', 'LEAD_AUDITOR')
    @Permissions('documents.manage')
    renderTemplate(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: RenderControlledTemplateDto,
        @Req() request: SecurityRequest,
    ) {
        return this.templates.render(id, dto, this.actor(request));
    }
}

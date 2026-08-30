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
import { DocumentControlService } from './document-control.service';
import {
    AttachControlledFileDto,
    AttachOfficialFileDto,
    CreateControlledDocumentDto,
    CreateControlledDocumentRevisionDto,
    CreateControlledTemplateDto,
    CreateTemplateRevisionDto,
    ControlledVoidDto,
    EffectiveTemplateDto,
    WorkflowNoteDto,
} from './dto/document-control.dto';

const INTERNAL_READ_ROLES = [
    'ADMIN',
    'STAFF',
    'SALES',
    'COORDINATOR',
    'LEAD_AUDITOR',
    'AUDITOR',
    'TECHNICAL_REVIEWER',
    'DECISION_MAKER',
];

const CONTROL_ROLES = ['ADMIN', 'STAFF'];

@Controller('document-control')
@ApiTags('15. Kiểm soát biểu mẫu và tài liệu')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DocumentControlController {
    constructor(private readonly service: DocumentControlService) {}

    private actor(request: SecurityRequest) {
        return {
            userId: getActorUserId(request),
            roles: request.user?.roles ?? [],
        };
    }

    @Get('templates')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('documents.read')
    @ApiOperation({ summary: 'Danh sách controlled template series và revision' })
    listTemplates() {
        return this.service.listTemplates();
    }

    @Post('templates')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    createTemplate(@Body() dto: CreateControlledTemplateDto, @Req() request: SecurityRequest) {
        return this.service.createTemplate(dto, this.actor(request));
    }

    @Post('templates/:id/revisions')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    createTemplateRevision(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateTemplateRevisionDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.createTemplateRevision(id, dto, this.actor(request));
    }

    @Post('template-versions/:id/source-file')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    attachTemplateSource(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AttachControlledFileDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.attachTemplateSource(id, dto.file_id, this.actor(request));
    }

    @Post('template-versions/:id/submit-review')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    submitTemplateReview(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.submitTemplateReview(id, dto, this.actor(request));
    }

    @Post('template-versions/:id/review')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    reviewTemplate(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.reviewTemplate(id, dto, this.actor(request));
    }

    @Post('template-versions/:id/approve')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    approveTemplate(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.approveTemplate(id, dto, this.actor(request));
    }

    @Post('template-versions/:id/effective')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    makeTemplateEffective(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: EffectiveTemplateDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.makeTemplateEffective(id, dto, this.actor(request));
    }

    @Post('template-versions/:id/import-effective')
    @Roles('ADMIN')
    @Permissions('documents.manage')
    @ApiOperation({ summary: 'Nhập phiên bản mẫu đầu tiên đã có hiệu lực trước khi sử dụng CMP' })
    importExistingTemplate(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: EffectiveTemplateDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.importExistingTemplateEffective(id, dto, this.actor(request));
    }

    @Post('template-versions/:id/withdraw')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    withdrawTemplate(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ControlledVoidDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.withdrawTemplate(id, dto, this.actor(request));
    }

    @Get('documents')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('documents.read')
    listDocuments(
        @Req() request: SecurityRequest,
        @Query('status') status?: string,
        @Query('document_type') documentType?: string,
        @Query('search') search?: string,
    ) {
        return this.service.listDocuments(this.actor(request), {
            status,
            document_type: documentType,
            search,
        });
    }

    @Post('documents')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR', 'LEAD_AUDITOR')
    @Permissions('documents.manage')
    createDocument(@Body() dto: CreateControlledDocumentDto, @Req() request: SecurityRequest) {
        return this.service.createDocument(dto, this.actor(request));
    }

    @Get('documents/:id')
    @Roles(...INTERNAL_READ_ROLES)
    @Permissions('documents.read')
    findDocument(@Param('id', ParseUUIDPipe) id: string, @Req() request: SecurityRequest) {
        return this.service.findDocument(id, this.actor(request));
    }

    @Post('documents/:id/revisions')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR', 'LEAD_AUDITOR')
    @Permissions('documents.manage')
    reviseIssuedDocument(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CreateControlledDocumentRevisionDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.reviseIssuedDocument(id, dto, this.actor(request));
    }

    @Post('document-versions/:id/working-file')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR', 'LEAD_AUDITOR')
    @Permissions('documents.manage')
    attachWorkingFile(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AttachControlledFileDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.attachWorkingFile(id, dto.file_id, this.actor(request));
    }

    @Post('document-versions/:id/submit-review')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    submitDocumentReview(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.submitDocumentReview(id, dto, this.actor(request));
    }

    @Post('document-versions/:id/review')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    reviewDocument(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.reviewDocument(id, dto, this.actor(request));
    }

    @Post('document-versions/:id/approve')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    approveDocument(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.approveDocument(id, dto, this.actor(request));
    }

    @Post('document-versions/:id/official-file')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    attachOfficialFile(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: AttachOfficialFileDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.attachOfficialFile(id, dto, this.actor(request));
    }

    @Post('document-versions/:id/issue')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    issueDocument(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: WorkflowNoteDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.issueDocument(id, dto, this.actor(request));
    }

    @Post('document-versions/:id/void')
    @Roles(...CONTROL_ROLES)
    @Permissions('documents.manage')
    voidDocumentVersion(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ControlledVoidDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.voidDocumentVersion(id, dto, this.actor(request));
    }
}

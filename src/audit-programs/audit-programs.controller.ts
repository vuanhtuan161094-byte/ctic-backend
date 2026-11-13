import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
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

import { AuditProgramsService } from './audit-programs.service';
import { P09Gs1ExceptionService } from './p09-gs1-exception.service';
import { RequestGs1ExceptionDto, DecideGs1ExceptionDto } from './dto/p09-gs1-exception.dto';
import {
    AuditProgramEventDto,
    CopyAuditProgramDto,
    CreateAuditProgramDto,
} from './dto/create-audit-program.dto';
import { UpdateAuditProgramDto } from './dto/update-audit-program.dto';
import { UpdateAuditProgramEventDto } from './dto/update-audit-program-event.dto';

@Controller('audit-programs')
@ApiTags('09. Chương trình đánh giá')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class AuditProgramsController {
    constructor(
        private readonly auditProgramsService:
            AuditProgramsService,
        private readonly resourceAccess:
            ResourceAccessService,
        private readonly gs1Exception: P09Gs1ExceptionService,
    ) { }

    private getUserId(
        request: {
            user?: {
                id?: string;
                userId?: string;
                sub?: string;
            };
        },
    ): string | undefined {
        return (
            request.user?.id ??
            request.user?.userId ??
            request.user?.sub
        );
    }

    @Post()
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_programs.manage')
    @ApiOperation({
        summary: 'Tạo chương trình đánh giá',
    })
    @ApiCreatedResponse({
        description: 'Tạo chương trình và các sự kiện thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu không hợp lệ hoặc dự án đã có chương trình trong năm',
    })
    create(
        @Body()
        dto: CreateAuditProgramDto,

        @Req()
        request: {
            user?: {
                id?: string;
                userId?: string;
                sub?: string;
            };
        },
    ) {
        return this.auditProgramsService.create(
            dto,
            this.getUserId(request),
        );
    }

    @Post(':id/copy')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_programs.manage')
    @ApiOperation({
        summary: 'Sao chép chương trình sang năm mới',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chương trình nguồn',
    })
    @ApiCreatedResponse({
        description: 'Đã tạo chương trình mới từ chương trình nguồn',
    })
    copy(
        @Param('id')
        id: string,

        @Body()
        dto: CopyAuditProgramDto,

        @Req()
        request: {
            user?: {
                id?: string;
                userId?: string;
                sub?: string;
            };
        },
    ) {
        return this.auditProgramsService.copy(
            id,
            dto,
            this.getUserId(request),
        );
    }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_programs.read')
    @ApiOperation({
        summary: 'Lấy danh sách chương trình đánh giá',
    })
    @ApiOkResponse({
        description: 'Danh sách chương trình đánh giá',
    })
    async findAll(
        @Req()
        request: SecurityRequest,
    ) {
        const programs =
            await this.auditProgramsService.findAll();

        return this.resourceAccess.filterEntities(
            programs.map((program) => ({
                ...program,
                entity_type: 'audit_program',
                entity_id: program.id,
            })),
            getResourceActor(request),
        ).then((items) =>
            items.map(({
                entity_type: _entityType,
                entity_id: _entityId,
                ...program
            }) => program),
        );
    }

    @Get('project/:projectId')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_programs.read')
    @ApiOperation({
        summary: 'Lấy chương trình đánh giá theo dự án',
    })
    @ApiParam({
        name: 'projectId',
        description: 'UUID dự án chứng nhận',
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
    })
    @ApiOkResponse({
        description: 'Các chương trình thuộc dự án',
    })
    async findByProject(
        @Param('projectId')
        projectId: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertProjectAccess(
            projectId,
            getResourceActor(request),
        );

        return this.auditProgramsService.findByProject(
            projectId,
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('audit_programs.read')
    @ApiOperation({
        summary: 'Lấy chi tiết chương trình đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chương trình đánh giá',
    })
    @ApiOkResponse({
        description: 'Chương trình và các sự kiện đánh giá',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy chương trình',
    })
    async findOne(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            {
                entity_type: 'audit_program',
                entity_id: id,
            },
            getResourceActor(request),
        );

        return this.auditProgramsService.findOne(id);
    }

    @Patch(':id')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_programs.manage')
    @ApiOperation({
        summary: 'Cập nhật chương trình đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chương trình đánh giá',
    })
    @ApiOkResponse({
        description: 'Cập nhật chương trình thành công',
    })
    update(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateAuditProgramDto,
    ) {
        return this.auditProgramsService.update(
            id,
            dto,
        );
    }

    @Post(':id/events')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_programs.manage')
    @ApiOperation({
        summary: 'Thêm sự kiện vào chương trình',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chương trình đánh giá',
    })
    @ApiCreatedResponse({
        description: 'Đã thêm sự kiện đánh giá',
    })
    addEvent(
        @Param('id')
        id: string,

        @Body()
        dto: AuditProgramEventDto,
    ) {
        return this.auditProgramsService.addEvent(
            id,
            dto,
        );
    }

    @Patch(':programId/events/:eventId')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_programs.manage')
    @ApiOperation({
        summary: 'Cập nhật sự kiện đánh giá',
    })
    @ApiParam({
        name: 'programId',
        description: 'UUID chương trình đánh giá',
    })
    @ApiParam({
        name: 'eventId',
        description: 'UUID sự kiện đánh giá',
    })
    @ApiOkResponse({
        description: 'Cập nhật sự kiện thành công',
    })
    updateEvent(
        @Param('programId')
        programId: string,

        @Param('eventId')
        eventId: string,

        @Body()
        dto: UpdateAuditProgramEventDto,
    ) {
        return this.auditProgramsService.updateEvent(
            programId,
            eventId,
            dto,
        );
    }

    @Get(':programId/events/:eventId/gs1-exception')
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('audit_programs.read')
    @ApiOperation({ summary: 'Xem hồ sơ ngoại lệ hạn giám sát lần 1 và quyết định QMR gần nhất' })
    async getGs1Exception(
        @Param('programId') programId: string,
        @Param('eventId') eventId: string,
        @Req() request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_program', entity_id: programId },
            getResourceActor(request),
        );
        return this.gs1Exception.latest(programId, eventId);
    }

    @Post(':programId/events/:eventId/gs1-exception/request')
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('audit_programs.manage')
    @ApiOperation({ summary: 'Đề nghị ngoại lệ GS1 sau 12 tháng với QMR chỉ định; không tự phê duyệt' })
    async requestGs1Exception(
        @Param('programId') programId: string,
        @Param('eventId') eventId: string,
        @Body() dto: RequestGs1ExceptionDto,
        @Req() request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_program', entity_id: programId },
            getResourceActor(request),
        );
        const actor = this.getUserId(request);
        if (!actor) throw new BadRequestException('Thiếu người lập đề nghị ngoại lệ');
        return this.gs1Exception.request(programId, eventId, dto, actor);
    }

    @Post(':programId/events/:eventId/gs1-exception/decide')
    @Roles('ADMIN')
    @Permissions('audit_programs.manage')
    @ApiOperation({ summary: 'QMR được chỉ định quyết định ngoại lệ GS1, có bằng chứng và SoD' })
    async decideGs1Exception(
        @Param('programId') programId: string,
        @Param('eventId') eventId: string,
        @Body() dto: DecideGs1ExceptionDto,
        @Req() request: SecurityRequest,
    ) {
        await this.resourceAccess.assertEntityAccess(
            { entity_type: 'audit_program', entity_id: programId },
            getResourceActor(request),
        );
        const actor = this.getUserId(request);
        if (!actor) throw new BadRequestException('Thiếu tài khoản QMR');
        return this.gs1Exception.decide(programId, eventId, dto, actor);
    }

    @Delete(':programId/events/:eventId')
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('audit_programs.manage')
    @ApiOperation({
        summary: 'Xóa sự kiện khỏi chương trình',
    })
    @ApiParam({
        name: 'programId',
        description: 'UUID chương trình đánh giá',
    })
    @ApiParam({
        name: 'eventId',
        description: 'UUID sự kiện đánh giá',
    })
    @ApiOkResponse({
        description: 'Đã xóa sự kiện',
    })
    removeEvent(
        @Param('programId')
        programId: string,

        @Param('eventId')
        eventId: string,
    ) {
        return this.auditProgramsService.removeEvent(
            programId,
            eventId,
        );
    }

    @Delete(':id')
    @Roles('ADMIN')
    @Permissions('audit_programs.manage')
    @ApiOperation({
        summary: 'Xóa chương trình đánh giá',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chương trình đánh giá',
    })
    @ApiOkResponse({
        description: 'Đã xóa chương trình',
    })
    remove(
        @Param('id')
        id: string,
    ) {
        return this.auditProgramsService.remove(id);
    }
}

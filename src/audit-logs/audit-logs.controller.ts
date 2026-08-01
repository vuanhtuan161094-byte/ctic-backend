import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Query,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';

import {
    ApiBearerAuth,
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

import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Controller('audit-logs')
@ApiTags('27. Nhật ký hệ thống')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
@Roles('ADMIN')
@Permissions(
    'audit_logs.read',
)
@UsePipes(
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }),
)
export class AuditLogsController {
    constructor(
        private readonly auditLogsService:
            AuditLogsService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Tra cứu nhật ký thao tác hệ thống' })
    @ApiOkResponse({ description: 'Danh sách nhật ký có phân trang' })
    findAll(
        @Query()
        query: AuditLogQueryDto,
    ): Promise<unknown> {
        return this.auditLogsService.findAll(
            query,
        );
    }

    @Get('summary')
    @ApiOperation({ summary: 'Thống kê nhật ký theo hành động và loại dữ liệu' })
    @ApiOkResponse({ description: 'Số liệu tổng hợp nhật ký hệ thống' })
    getSummary(
        @Query()
        query: AuditLogQueryDto,
    ): Promise<unknown> {
        return this.auditLogsService.getSummary(
            query,
        );
    }

    @Get(':id')
    @ApiOperation({ summary: 'Lấy chi tiết một bản ghi nhật ký' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Chi tiết bản ghi nhật ký' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy bản ghi nhật ký' })
    findOne(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.auditLogsService.findOne(
            id,
        );
    }
}

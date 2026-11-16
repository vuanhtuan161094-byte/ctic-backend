import {
    Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getActorUserId } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import { P09F16Service } from './p09-f16.service';
import { ApproveP09RecognizedListDto, CreateP09RecognizedListDto } from './dto/p09-f16.dto';

@Controller('p09/recognized-certification-bodies')
@ApiTags('P.09 F.16 — Danh sách tổ chức được thừa nhận')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class P09F16Controller {
    constructor(private readonly service: P09F16Service) {}

    @Get()
    @Roles('ADMIN', 'STAFF')
    @Permissions('documents.read')
    @ApiOperation({ summary: 'Lịch sử phiên bản F.16 (chỉ nội bộ)' })
    list() { return this.service.list(); }

    @Get('approved')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR')
    @Permissions('documents.read')
    @ApiOperation({ summary: 'Phiên bản F.16 đã được phê duyệt gần nhất' })
    approved() { return this.service.approved(); }

    @Post()
    @Roles('ADMIN', 'STAFF')
    @Permissions('documents.manage')
    @ApiOperation({ summary: 'Lập phiên bản F.16 mới, chưa có hiệu lực trước phê duyệt' })
    create(@Body() dto: CreateP09RecognizedListDto, @Req() request: SecurityRequest) {
        return this.service.create(dto, getActorUserId(request));
    }

    @Post(':id/approve')
    @Roles('ADMIN')
    @Permissions('documents.manage')
    @ApiOperation({ summary: 'Phê duyệt F.16 độc lập, không tự động thay đổi ngày công đánh giá' })
    approve(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ApproveP09RecognizedListDto,
        @Req() request: SecurityRequest,
    ) {
        return this.service.approve(id, dto, getActorUserId(request));
    }
}

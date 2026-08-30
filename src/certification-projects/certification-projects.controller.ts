import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
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
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ResourceAccessService } from '../security/resource-access.service';
import { getActorUserId } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';

import { CertificationProjectsService } from './certification-projects.service';
import { CreateCertificationProjectDto } from './dto/create-certification-project.dto';
import { CreateCompleteCertificationProjectDto } from './dto/create-complete-certification-project.dto';

@Controller('certification-projects')
@ApiTags('07. Dự án chứng nhận')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class CertificationProjectsController {
    constructor(
        private readonly certificationProjectsService:
            CertificationProjectsService,
        private readonly resourceAccess:
            ResourceAccessService,
    ) { }

    private actor(
        request: SecurityRequest,
    ) {
        return {
            userId:
                getActorUserId(
                    request,
                ),
            roles:
                request.user?.roles ??
                [],
        };
    }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_EXPERT',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('projects.read')
    @ApiOperation({
        summary: 'Lấy danh sách dự án chứng nhận',
    })
    @ApiOkResponse({
        description: 'Danh sách dự án chứng nhận',
    })
    async findAll(
        @Req()
        request: SecurityRequest,
    ) {
        const accessible =
            await this.resourceAccess.getAccessibleProjectIds(
                this.actor(request),
            );

        return this.certificationProjectsService.findAll(
            accessible === null
                ? undefined
                : Array.from(accessible),
        );
    }

    @Get(':id/dossier')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_EXPERT',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('projects.read')
    @ApiOperation({
        summary: 'Lấy hồ sơ tổng hợp F.17 của dự án',
        description:
            'Trả trạng thái hoàn thành của các thành phần hồ sơ chứng nhận.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của dự án chứng nhận',
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
    })
    @ApiOkResponse({
        description: 'Danh mục và tỷ lệ hoàn thành hồ sơ dự án',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy dự án chứng nhận',
    })
    async getDossier(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertProjectAccess(
            id,
            this.actor(request),
        );

        return this.certificationProjectsService.getDossier(
            id,
        );
    }

    @Get(':id/alerts')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_EXPERT',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('projects.read')
    @ApiOperation({
        summary: 'Lấy cảnh báo của dự án',
        description:
            'Kiểm tra hồ sơ thiếu, NC/CAP chưa đóng và các thời hạn cần theo dõi.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của dự án chứng nhận',
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
    })
    @ApiQuery({
        name: 'warning_days',
        required: false,
        type: Number,
        example: 30,
        description: 'Số ngày cảnh báo trước hạn; mặc định 30 ngày',
    })
    @ApiOkResponse({
        description: 'Danh sách cảnh báo của dự án',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy dự án chứng nhận',
    })
    async getAlerts(
        @Param('id')
        id: string,

        @Query('warning_days')
        warningDays: string | undefined,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertProjectAccess(
            id,
            this.actor(request),
        );

        return this.certificationProjectsService.getAlerts(
            id,
            Number(warningDays ?? 30),
            request.user?.roles ?? [],
        );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'AUDITOR',
        'TECHNICAL_EXPERT',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('projects.read')
    @ApiOperation({
        summary: 'Lấy chi tiết dự án chứng nhận',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của dự án chứng nhận',
        example: '3dc2475f-37e3-4778-8eaa-0d5dd31306fd',
    })
    @ApiOkResponse({
        description: 'Thông tin chi tiết và các quan hệ của dự án',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy dự án chứng nhận',
    })
    async findOne(
        @Param('id')
        id: string,

        @Req()
        request: SecurityRequest,
    ) {
        await this.resourceAccess.assertProjectAccess(
            id,
            this.actor(request),
        );

        return this.certificationProjectsService.findOne(
            id,
        );
    }

    @Post('complete')
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
    )
    @Permissions('projects.manage')
    @ApiOperation({
        summary: 'Khởi tạo hoàn chỉnh hồ sơ chứng nhận',
        description:
            'Tạo hợp đồng/thỏa thuận và dự án chứng nhận trong một giao dịch từ đơn đăng ký đã được chấp nhận.',
    })
    @ApiCreatedResponse({
        description: 'Đã tạo hồ sơ thương mại và dự án chứng nhận',
    })
    @ApiBadRequestResponse({
        description: 'Đơn chưa đủ điều kiện, dữ liệu hợp đồng/thỏa thuận không hợp lệ hoặc hồ sơ đã được tạo trước đó',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy đơn đăng ký hoặc dữ liệu liên kết',
    })
    createComplete(
        @Body()
        dto: CreateCompleteCertificationProjectDto,
    ) {
        return this.certificationProjectsService.createComplete(
            dto,
        );
    }

    @Post()
    @Roles(
        'ADMIN',
        'STAFF',
        'COORDINATOR',
    )
    @Permissions('projects.manage')
    @ApiOperation({
        summary: 'Tạo dự án chứng nhận',
        description:
            'Tạo dự án từ hồ sơ đã được chấp nhận và hợp đồng hoặc thỏa thuận hợp lệ.',
    })
    @ApiCreatedResponse({
        description: 'Tạo dự án chứng nhận thành công',
    })
    @ApiBadRequestResponse({
        description: 'Hồ sơ chưa được chấp nhận, thiếu hợp đồng/thỏa thuận hoặc dữ liệu liên kết không hợp lệ',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy hồ sơ, hợp đồng hoặc thỏa thuận',
    })
    create(
        @Body()
        dto: CreateCertificationProjectDto,
    ) {
        return this.certificationProjectsService.create(
            dto,
        );
    }
}

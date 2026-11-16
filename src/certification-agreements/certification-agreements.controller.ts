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
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import type { SecurityRequest } from '../security/security-request';
import { getActorUserId } from '../security/security-request';

import { CertificationAgreementsService } from './certification-agreements.service';
import { CreateCertificationAgreementDto } from './dto/create-certification-agreement.dto';
import { VerifyF18EvidenceDto } from './dto/verify-f18-evidence.dto';

@Controller('certification-agreements')
@ApiTags('06. Thỏa thuận chứng nhận')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class CertificationAgreementsController {
    constructor(
        private readonly certificationAgreementsService:
            CertificationAgreementsService,
    ) { }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
    )
    @Permissions('contracts.read')
    @ApiOperation({
        summary: 'Lấy danh sách thỏa thuận chứng nhận',
    })
    @ApiOkResponse({
        description: 'Danh sách thỏa thuận, khách hàng và hợp đồng liên quan',
    })
    findAll() {
        return this.certificationAgreementsService.findAll();
    }

    @Get('language-sources')
    @Roles('ADMIN', 'STAFF', 'SALES', 'COORDINATOR')
    @Permissions('contracts.read')
    @ApiOperation({ summary: 'Kiểm tra 3 mẫu F.18 VN, VN-EN, VN-CN đã có hiệu lực trong thư viện' })
    languages() { return this.certificationAgreementsService.languageSources(); }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
    )
    @Permissions('contracts.read')
    @ApiOperation({
        summary: 'Lấy chi tiết thỏa thuận chứng nhận',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của thỏa thuận chứng nhận',
        example: 'cbf05033-9f09-4daa-8b89-859a500685bc',
    })
    @ApiOkResponse({
        description: 'Thông tin thỏa thuận chứng nhận',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy thỏa thuận chứng nhận',
    })
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.certificationAgreementsService.findOne(
            id,
        );
    }

    @Post()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
    )
    @Permissions('contracts.manage')
    @ApiOperation({
        summary: 'Tạo thỏa thuận chứng nhận',
    })
    @ApiCreatedResponse({
        description: 'Tạo thỏa thuận chứng nhận thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu hoặc quan hệ khách hàng - hợp đồng không hợp lệ',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy khách hàng hoặc hợp đồng',
    })
    create(
        @Body()
        dto: CreateCertificationAgreementDto,
        @Req() request: SecurityRequest,
    ) {
        return this.certificationAgreementsService.create(
            dto,
            getActorUserId(request) ?? undefined,
        );
    }
    @Get(':id/evidence-status')
    @Roles('ADMIN', 'STAFF', 'SALES', 'COORDINATOR')
    @Permissions('contracts.read')
    @ApiOperation({ summary: 'Trạng thái đối chiếu SHA và người xác minh bản ký F.18' })
    evidenceStatus(@Param('id') id: string) {
        return this.certificationAgreementsService.evidenceStatus(id);
    }

    @Post(':id/verify-evidence')
    @Roles('ADMIN')
    @Permissions('contracts.manage')
    @ApiOperation({ summary: 'Xác minh độc lập bản ký F.18; không tạo chữ ký pháp lý thay người ký' })
    verifyEvidence(
        @Param('id') id: string,
        @Body() dto: VerifyF18EvidenceDto,
        @Req() request: SecurityRequest,
    ) {
        return this.certificationAgreementsService.verifyEvidence(
            id, dto, getActorUserId(request) ?? undefined,
        );
    }

    @Post(':id/prepare-language')
    @Roles('ADMIN', 'STAFF')
    @Permissions('contracts.manage')
    @ApiOperation({ summary: 'Tạo bản F.18 VN / VN-EN / VN-CN chưa ký từ mẫu pháp lý nguyên gốc đã kiểm soát' })
    prepareLanguage(
        @Param('id') id: string,
        @Query('language') language: 'vi' | 'vi_en' | 'vi_cn',
        @Query('format') format: 'docx' | 'pdf',
        @Req() request: SecurityRequest,
    ) {
        return this.certificationAgreementsService.prepareLanguage(
            id, language, format, getActorUserId(request) ?? undefined,
        );
    }

}

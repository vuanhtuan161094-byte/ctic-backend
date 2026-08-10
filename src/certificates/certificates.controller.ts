import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Req,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiConsumes,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';

import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import {
    createSecureUploadOptions,
    TempUploadCleanupInterceptor,
} from '../common/upload-security';
import { DocumentFilesService } from '../document-files/document-files.service';

import { CertificatesService } from './certificates.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateStatusDto } from './dto/update-certificate-status.dto';

interface AuthenticatedRequest {
    user?: {
        id?: string;
        userId?: string;
        sub?: string;
    };
}

@Controller('certificates')
@ApiTags('18. Chứng chỉ')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class CertificatesController {
    constructor(
        private readonly certificatesService:
            CertificatesService,
        private readonly documentFilesService:
            DocumentFilesService,
    ) { }

    private getUserId(
        request: AuthenticatedRequest,
    ): string | undefined {
        return (
            request.user?.userId ??
            request.user?.id ??
            request.user?.sub
        );
    }

    @Post()
    @Roles(
        'ADMIN',
        'DECISION_MAKER',
    )
    @Permissions('certificates.manage')
    @ApiOperation({
        summary: 'Cấp chứng chỉ',
        description:
            'Cấp chứng chỉ từ hồ sơ đã có quyết định phù hợp; tự thay thế chứng chỉ cũ khi cần.',
    })
    @ApiCreatedResponse({
        description: 'Cấp chứng chỉ thành công và sinh mã xác minh',
    })
    @ApiBadRequestResponse({
        description: 'Chưa có quyết định hoặc thông báo phù hợp',
    })
    @ApiConflictResponse({
        description: 'Hồ sơ thẩm xét hoặc số chứng chỉ đã được sử dụng',
    })
    create(
        @Body()
        dto: CreateCertificateDto,

        @Req()
        request: AuthenticatedRequest,
    ) {
        return this.certificatesService.create(
            dto,
            this.getUserId(request),
        );
    }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'DECISION_MAKER',
    )
    @Permissions('certificates.read')
    @ApiOperation({
        summary: 'Lấy danh sách chứng chỉ',
    })
    @ApiOkResponse({
        description: 'Danh sách chứng chỉ và trạng thái hiện tại',
    })
    findAll() {
        return this.certificatesService.findAll();
    }

    @Get('plan/:planId/workspace')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'DECISION_MAKER',
    )
    @Permissions('certificates.read')
    @ApiOperation({
        summary: 'Lấy không gian cấp giấy chứng nhận theo kế hoạch Giai đoạn 2',
        description:
            'Tổng hợp báo cáo, thẩm xét, quyết định, thông báo, chứng chỉ hiện hành và điều kiện cấp.',
    })
    @ApiParam({
        name: 'planId',
        description: 'UUID kế hoạch đánh giá Giai đoạn 2',
    })
    @ApiOkResponse({
        description: 'Không gian cấp và quản lý giấy chứng nhận',
    })
    getPlanWorkspace(
        @Param('planId', ParseUUIDPipe) planId: string,
    ) {
        return this.certificatesService.getPlanIssuanceWorkspace(planId);
    }

    @Post(':id/pdf')
    @Roles(
        'ADMIN',
        'DECISION_MAKER',
    )
    @Permissions('certificates.manage')
    @ApiOperation({
        summary: 'Tải PDF giấy chứng nhận chính thức',
        description:
            'Tạo phiên bản PDF mới cho giấy chứng nhận; bản cũ vẫn được giữ trong lịch sử.',
    })
    @ApiConsumes('multipart/form-data')
    @UseInterceptors(
        FileInterceptor(
            'file',
            createSecureUploadOptions(['.pdf']),
        ),
        new TempUploadCleanupInterceptor(),
    )
    async uploadOfficialPdf(
        @Param('id', ParseUUIDPipe) id: string,
        @UploadedFile() file: Express.Multer.File,
        @Req() request: AuthenticatedRequest,
    ) {
        await this.certificatesService.findOne(id);
        if (!file) {
            throw new BadRequestException('Chưa chọn file PDF giấy chứng nhận');
        }

        return this.documentFilesService.upload(
            {
                entity_type: 'certificate',
                entity_id: id,
                document_type: 'certificate_pdf',
                file_kind: 'signed_scan',
                note: 'Giấy chứng nhận PDF chính thức',
            },
            file,
            this.getUserId(request),
        );
    }

    @Get('technical-review/:technicalReviewId')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'DECISION_MAKER',
    )
    @Permissions('certificates.read')
    @ApiOperation({
        summary: 'Lấy chứng chỉ theo hồ sơ thẩm xét',
    })
    @ApiParam({
        name: 'technicalReviewId',
        description: 'UUID hồ sơ thẩm xét kỹ thuật',
        example: '5389468f-a200-40fd-a2d2-4ca8c0db14a3',
    })
    @ApiOkResponse({
        description: 'Chứng chỉ được cấp từ hồ sơ thẩm xét',
    })
    findByTechnicalReview(
        @Param('technicalReviewId')
        technicalReviewId: string,
    ) {
        return this.certificatesService
            .findByTechnicalReview(
                technicalReviewId,
            );
    }

    @Patch(':id/status')
    @Roles(
        'ADMIN',
        'DECISION_MAKER',
    )
    @Permissions('certificates.manage')
    @ApiOperation({
        summary: 'Thay đổi trạng thái chứng chỉ',
        description: 'Đình chỉ, khôi phục, thu hồi hoặc xác nhận hết hạn chứng chỉ.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chứng chỉ',
        example: 'ce8fff22-313f-48d9-82dc-b6ec0dd9ff41',
    })
    @ApiOkResponse({
        description: 'Đã cập nhật trạng thái và ghi lịch sử',
    })
    @ApiBadRequestResponse({
        description: 'Chuyển trạng thái không hợp lệ',
    })
    updateStatus(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateCertificateStatusDto,

        @Req()
        request: AuthenticatedRequest,
    ) {
        return this.certificatesService.updateStatus(
            id,
            dto,
            this.getUserId(request),
        );
    }

    @Get(':id/status-history')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'DECISION_MAKER',
    )
    @Permissions('certificates.read')
    @ApiOperation({
        summary: 'Lấy lịch sử trạng thái chứng chỉ',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chứng chỉ',
    })
    @ApiOkResponse({
        description: 'Lịch sử đình chỉ, khôi phục, thu hồi và hết hạn',
    })
    getStatusHistory(
        @Param('id')
        id: string,
    ) {
        return this.certificatesService
            .getStatusHistory(id);
    }

    @Post('actions/expire-due')
    @Roles('ADMIN')
    @Permissions('certificates.manage')
    @ApiOperation({
        summary: 'Tự động chuyển các chứng chỉ quá hạn sang expired',
    })
    @ApiOkResponse({
        description: 'Kết quả xử lý chứng chỉ quá hạn',
    })
    expireDueCertificates() {
        return this.certificatesService
            .expireDueCertificates();
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'DECISION_MAKER',
    )
    @Permissions('certificates.read')
    @ApiOperation({
        summary: 'Lấy chi tiết chứng chỉ',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID chứng chỉ',
        example: 'ce8fff22-313f-48d9-82dc-b6ec0dd9ff41',
    })
    @ApiOkResponse({
        description: 'Chi tiết chứng chỉ và hồ sơ phát hành',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy chứng chỉ',
    })
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.certificatesService.findOne(id);
    }
}

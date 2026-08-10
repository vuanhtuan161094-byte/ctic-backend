import {
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Res,
    UseGuards,
} from '@nestjs/common';
import {
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiProduces,
    ApiTags,
} from '@nestjs/swagger';

import type { Response } from 'express';

import { CertificatesService } from './certificates.service';
import { SecurityRateLimit } from '../security/security-rate-limit.decorator';
import { SecurityRateLimitGuard } from '../security/security-rate-limit.guard';

@Controller('public/certificates')
@ApiTags('19. Tra cứu chứng chỉ công khai')
@UseGuards(SecurityRateLimitGuard)
@SecurityRateLimit('public_certificate')
export class PublicCertificatesController {
    constructor(
        private readonly certificatesService:
            CertificatesService,
    ) { }

    @Get(':verificationCode/pdf')
    @ApiOperation({
        summary: 'Mở PDF chứng chỉ chính thức',
        description: 'Không yêu cầu đăng nhập. QR trên chứng chỉ có thể dẫn tới đường dẫn này.',
    })
    @ApiParam({
        name: 'verificationCode',
        description: 'Mã xác minh UUID của chứng chỉ',
        example: '9557648a-1d22-4aaf-84a8-f8c0f97e40fe',
    })
    @ApiProduces('application/pdf')
    @ApiOkResponse({
        description: 'Nội dung tệp PDF chứng chỉ',
        schema: {
            type: 'string',
            format: 'binary',
        },
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy chứng chỉ hoặc chưa có PDF hiện hành',
    })
    async openPdf(
        @Param(
            'verificationCode',
            ParseUUIDPipe,
        )
        verificationCode: string,

        @Res()
        response: Response,
    ) {
        const result =
            await this.certificatesService.getPublicPdf(
                verificationCode,
            );

        response.setHeader(
            'Content-Type',
            'application/pdf',
        );

        response.setHeader(
            'Content-Disposition',
            `inline; filename*=UTF-8''${encodeURIComponent(
                result.documentFile.original_name,
            )}`,
        );

        return response.sendFile(
            result.absolutePath,
        );
    }

    @Get(':verificationCode/qr')
    @ApiOperation({
        summary: 'Tải mã QR của chứng chỉ',
        description: 'Mã QR chứa đường dẫn mở PDF chứng chỉ công khai.',
    })
    @ApiParam({
        name: 'verificationCode',
        description: 'Mã xác minh UUID của chứng chỉ',
        example: '9557648a-1d22-4aaf-84a8-f8c0f97e40fe',
    })
    @ApiProduces('image/png')
    @ApiOkResponse({
        description: 'Ảnh QR PNG',
        schema: {
            type: 'string',
            format: 'binary',
        },
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy chứng chỉ',
    })
    async getQrCode(
        @Param(
            'verificationCode',
            ParseUUIDPipe,
        )
        verificationCode: string,

        @Res()
        response: Response,
    ) {
        const result =
            await this.certificatesService.generateQrCode(
                verificationCode,
            );

        response.setHeader(
            'Content-Type',
            'image/png',
        );

        response.setHeader(
            'Content-Disposition',
            `attachment; filename="QR-${result.certNumber}.png"`,
        );

        response.setHeader(
            'X-QR-Target',
            result.targetUrl,
        );

        return response.send(
            result.qrCode,
        );
    }

    @Get(':verificationCode')
    @ApiOperation({
        summary: 'Tra cứu thông tin chứng chỉ',
        description: 'Không yêu cầu đăng nhập.',
    })
    @ApiParam({
        name: 'verificationCode',
        description: 'Mã xác minh UUID của chứng chỉ',
        example: '9557648a-1d22-4aaf-84a8-f8c0f97e40fe',
    })
    @ApiOkResponse({
        description: 'Thông tin xác minh và trạng thái chứng chỉ',
    })
    @ApiNotFoundResponse({
        description: 'Mã xác minh không tồn tại',
    })
    async verify(
        @Param(
            'verificationCode',
            ParseUUIDPipe,
        )
        verificationCode: string,
    ) {
        return this.certificatesService.findPublicCertificate(
            verificationCode,
        );
    }
}

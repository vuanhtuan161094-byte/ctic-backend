import {
    Injectable,
    Logger,
} from '@nestjs/common';

import { Cron } from '@nestjs/schedule';

import { CertificatesService } from './certificates.service';

@Injectable()
export class CertificatesScheduler {
    private readonly logger =
        new Logger(
            CertificatesScheduler.name,
        );

    constructor(
        private readonly certificatesService:
            CertificatesService,
    ) { }

    @Cron(
        '5 0 * * *',
        {
            name: 'expire-certificates',
            timeZone: 'Asia/Ho_Chi_Minh',
        },
    )
    async expireCertificates() {
        try {
            const result =
                await this.certificatesService
                    .expireDueCertificates();

            if (result.expired_count > 0) {
                this.logger.log(
                    `Đã tự động hết hạn ${result.expired_count} chứng chỉ`,
                );
            }
        } catch (error) {
            this.logger.error(
                'Không thể tự động cập nhật chứng chỉ hết hạn',
                error instanceof Error
                    ? error.stack
                    : String(error),
            );
        }
    }
}
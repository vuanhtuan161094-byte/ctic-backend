import { Module } from '@nestjs/common';
import { CertificationAgreementsService } from './certification-agreements.service';
import { CertificationAgreementsController } from './certification-agreements.controller';

@Module({
  providers: [CertificationAgreementsService],
  controllers: [CertificationAgreementsController]
})
export class CertificationAgreementsModule {}

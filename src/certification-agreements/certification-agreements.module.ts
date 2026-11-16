import { Module } from '@nestjs/common';
import { DocumentFilesModule } from '../document-files/document-files.module';
import { CertificationAgreementsService } from './certification-agreements.service';
import { CertificationAgreementsController } from './certification-agreements.controller';

@Module({
  imports: [DocumentFilesModule],
  providers: [CertificationAgreementsService],
  controllers: [CertificationAgreementsController]
})
export class CertificationAgreementsModule {}

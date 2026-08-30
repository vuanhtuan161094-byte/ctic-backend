import { Module } from '@nestjs/common';
import { CertificationApplicationsService } from './certification-applications.service';
import { CertificationApplicationsController } from './certification-applications.controller';

@Module({
  providers: [CertificationApplicationsService],
  controllers: [CertificationApplicationsController],
  exports: [CertificationApplicationsService],
})
export class CertificationApplicationsModule {}

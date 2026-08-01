import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { CertificatesController } from './certificates.controller';
import { PublicCertificatesController } from './public-certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificatesScheduler } from './certificates.scheduler';

@Module({
  imports: [
    PrismaModule,
  ],

  controllers: [
    CertificatesController,
    PublicCertificatesController,
  ],

  providers: [
    CertificatesService,
    CertificatesScheduler,
  ],

  exports: [
    CertificatesService,
  ],
})
export class CertificatesModule { }
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { DocumentFilesModule } from '../document-files/document-files.module';
import { SecurityModule } from '../security/security.module';

import { CertificatesController } from './certificates.controller';
import { CertificateWorkspaceController } from './certificate-workspace.controller';
import { PublicCertificatesController } from './public-certificates.controller';
import { CertificatesService } from './certificates.service';
import { P09SuspensionCaseService } from './p09-suspension-case.service';
import { CertificatesScheduler } from './certificates.scheduler';

@Module({
  imports: [
    PrismaModule,
    SecurityModule,
    DocumentFilesModule,
  ],

  controllers: [
    CertificateWorkspaceController,
    CertificatesController,
    PublicCertificatesController,
  ],

  providers: [
    CertificatesService,
    CertificatesScheduler,
    P09SuspensionCaseService,
  ],

  exports: [
    CertificatesService,
  ],
})
export class CertificatesModule { }

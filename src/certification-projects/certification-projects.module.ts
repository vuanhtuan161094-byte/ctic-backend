import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CertificationBodyCapabilitiesModule } from '../certification-body-capabilities/certification-body-capabilities.module';
import { CertificationProjectsController } from './certification-projects.controller';
import { CertificationProjectsService } from './certification-projects.service';

@Module({
  imports: [
    PrismaModule,
    CertificationBodyCapabilitiesModule,
  ],
  controllers: [
    CertificationProjectsController,
  ],
  providers: [
    CertificationProjectsService,
  ],
  exports: [
    CertificationProjectsService,
  ],
})
export class CertificationProjectsModule { }

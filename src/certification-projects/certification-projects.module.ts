import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CertificationProjectsController } from './certification-projects.controller';
import { CertificationProjectsService } from './certification-projects.service';

@Module({
  imports: [
    PrismaModule,
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
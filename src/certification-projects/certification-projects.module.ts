import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CertificationBodyCapabilitiesModule } from '../certification-body-capabilities/certification-body-capabilities.module';
import { AuditTeamAppointmentsModule } from '../audit-team-appointments/audit-team-appointments.module';
import { CertificationCaseProjectionService } from './certification-case-projection.service';
import { CertificationCasesController } from './certification-cases.controller';
import { CertificationProjectsController } from './certification-projects.controller';
import { CertificationProjectsService } from './certification-projects.service';

@Module({
  imports: [
    PrismaModule,
    CertificationBodyCapabilitiesModule,
    AuditTeamAppointmentsModule,
  ],
  controllers: [CertificationProjectsController, CertificationCasesController],
  providers: [CertificationProjectsService, CertificationCaseProjectionService],
  exports: [CertificationProjectsService],
})
export class CertificationProjectsModule {}

import {
  Module,
} from '@nestjs/common';

import { AuditTeamAppointmentsController } from './audit-team-appointments.controller';
import { AuditTeamAppointmentsService } from './audit-team-appointments.service';
import { AuditTeamCompetencyService } from './audit-team-competency.service';
import { AuditMandayAllocationService } from './audit-manday-allocation.service';
import { AuditTeamReadinessService } from './audit-team-readiness.service';

@Module({
  controllers: [
    AuditTeamAppointmentsController,
  ],

  providers: [
    AuditTeamAppointmentsService,
    AuditTeamCompetencyService,
    AuditMandayAllocationService,
    AuditTeamReadinessService,
  ],

  exports: [
    AuditTeamAppointmentsService,
    AuditTeamCompetencyService,
    AuditMandayAllocationService,
    AuditTeamReadinessService,
  ],
})
export class AuditTeamAppointmentsModule { }

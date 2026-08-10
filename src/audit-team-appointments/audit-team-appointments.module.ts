import {
  Module,
} from '@nestjs/common';

import { AuditTeamAppointmentsController } from './audit-team-appointments.controller';
import { AuditTeamAppointmentsService } from './audit-team-appointments.service';
import { AuditTeamCompetencyService } from './audit-team-competency.service';
import { AuditMandayAllocationService } from './audit-manday-allocation.service';

@Module({
  controllers: [
    AuditTeamAppointmentsController,
  ],

  providers: [
    AuditTeamAppointmentsService,
    AuditTeamCompetencyService,
    AuditMandayAllocationService,
  ],

  exports: [
    AuditTeamAppointmentsService,
    AuditTeamCompetencyService,
    AuditMandayAllocationService,
  ],
})
export class AuditTeamAppointmentsModule { }
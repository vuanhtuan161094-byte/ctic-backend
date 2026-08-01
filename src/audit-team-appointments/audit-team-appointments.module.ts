import {
  Module,
} from '@nestjs/common';

import { AuditTeamAppointmentsController } from './audit-team-appointments.controller';
import { AuditTeamAppointmentsService } from './audit-team-appointments.service';
import { AuditTeamCompetencyService } from './audit-team-competency.service';

@Module({
  controllers: [
    AuditTeamAppointmentsController,
  ],

  providers: [
    AuditTeamAppointmentsService,
    AuditTeamCompetencyService,
  ],

  exports: [
    AuditTeamAppointmentsService,
    AuditTeamCompetencyService,
  ],
})
export class AuditTeamAppointmentsModule { }
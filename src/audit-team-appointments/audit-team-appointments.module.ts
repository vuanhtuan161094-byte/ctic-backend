import {
  Module,
} from '@nestjs/common';

import { AuditTeamAppointmentsController } from './audit-team-appointments.controller';
import { AuditTeamAppointmentsService } from './audit-team-appointments.service';
import { AuditTeamCompetencyService } from './audit-team-competency.service';
import { AuditTeamProgramCompetencyService } from './audit-team-program-competency.service';
import { AuditTeamProjectScopeService } from './audit-team-project-scope.service';
import { AuditTeamScheduleConflictService } from './audit-team-schedule-conflict.service';
import { AuditMandayAllocationService } from './audit-manday-allocation.service';
import { AuditTeamReadinessService } from './audit-team-readiness.service';

@Module({
  controllers: [
    AuditTeamAppointmentsController,
  ],

  providers: [
    AuditTeamAppointmentsService,
    AuditTeamCompetencyService,
    AuditTeamProgramCompetencyService,
    AuditTeamProjectScopeService,
    AuditTeamScheduleConflictService,
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

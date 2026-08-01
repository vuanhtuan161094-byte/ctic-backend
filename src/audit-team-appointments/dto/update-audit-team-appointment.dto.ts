import {
    OmitType,
    PartialType,
} from '@nestjs/swagger';

import {
    CreateAuditTeamAppointmentDto,
} from './create-audit-team-appointment.dto';

export class UpdateAuditTeamAppointmentDto
    extends PartialType(
        OmitType(
            CreateAuditTeamAppointmentDto,
            [
                'audit_plan_id',
            ] as const,
        ),
    ) { }

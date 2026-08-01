import {
    OmitType,
    PartialType,
} from '@nestjs/swagger';

import { CreateAuditPlanDto } from './create-audit-plan.dto';

export class UpdateAuditPlanDto extends PartialType(
    OmitType(CreateAuditPlanDto, [
        'project_id',
        'audit_event_id',
    ] as const),
) { }

import {
    OmitType,
    PartialType,
} from '@nestjs/swagger';

import { CreateAuditProgramDto } from './create-audit-program.dto';

export class UpdateAuditProgramDto extends PartialType(
    OmitType(CreateAuditProgramDto, [
        'project_id',
        'program_year',
        'events',
    ] as const),
) { }

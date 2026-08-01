import { PartialType } from '@nestjs/swagger';

import { AuditProgramEventDto } from './create-audit-program.dto';

export class UpdateAuditProgramEventDto extends PartialType(
    AuditProgramEventDto,
) { }

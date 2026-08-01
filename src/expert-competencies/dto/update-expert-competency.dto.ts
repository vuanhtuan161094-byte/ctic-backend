import {
    OmitType,
    PartialType,
} from '@nestjs/swagger';

import {
    CreateExpertCompetencyDto,
} from './create-expert-competency.dto';

export class UpdateExpertCompetencyDto
    extends PartialType(
        OmitType(
            CreateExpertCompetencyDto,
            [
                'expert_id',
            ] as const,
        ),
    ) { }

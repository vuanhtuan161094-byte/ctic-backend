import { PartialType } from '@nestjs/swagger';
import { CreateExpertWorkExperienceDto } from './create-expert-work-experience.dto';

export class UpdateExpertWorkExperienceDto extends PartialType(
    CreateExpertWorkExperienceDto,
) {}

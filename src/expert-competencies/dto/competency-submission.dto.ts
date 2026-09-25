import { OmitType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CreateExpertCompetencyDto } from './create-expert-competency.dto';

export class CreateOwnCompetencyDto extends OmitType(CreateExpertCompetencyDto, ['expert_id'] as const) {}

export class ReturnCompetencyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

import { OmitType } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { CreateExpertCompetencyDto } from './create-expert-competency.dto';

export class BatchCompetencyDto extends OmitType(CreateExpertCompetencyDto, ['iaf_code', 'scope_level', 'nace_code', 'nace_revision'] as const) {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ArrayUnique()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @MaxLength(20, { each: true })
    iaf_codes!: string[];
}
export class OwnBatchCompetencyDto extends OmitType(BatchCompetencyDto, ['expert_id'] as const) {}

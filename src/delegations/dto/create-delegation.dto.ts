import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsDate,
    IsIn,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';

export class CreateDelegationDto {
    @IsOptional()
    @IsUUID()
    delegator_user_id?: string;

    @IsUUID()
    delegate_user_id!: string;

    @Type(() => Date)
    @IsDate()
    effective_from!: Date;

    @Type(() => Date)
    @IsDate()
    effective_to!: Date;

    @IsIn(['ACTION', 'PROJECT_ACTION'])
    scope_type!: 'ACTION' | 'PROJECT_ACTION';

    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(20)
    @IsString({ each: true })
    action_codes!: string[];

    @IsOptional()
    @IsUUID()
    project_id?: string;

    @IsString()
    @MaxLength(1000)
    reason!: string;
}

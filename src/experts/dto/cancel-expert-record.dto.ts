import { IsString, MinLength } from 'class-validator';

export class CancelExpertRecordDto {
    @IsString()
    @MinLength(3)
    reason!: string;
}

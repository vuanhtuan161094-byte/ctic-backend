import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class P09RecognizedOrganizationDto {
    @IsString()
    @MinLength(2)
    @MaxLength(255)
    name!: string;

    @IsString()
    @MinLength(3)
    @MaxLength(2000)
    recognition_scope!: string;
}

export class CreateP09RecognizedListDto {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => P09RecognizedOrganizationDto)
    organizations!: P09RecognizedOrganizationDto[];

    @IsString()
    @MinLength(20)
    @MaxLength(2000)
    justification!: string;
}

export class ApproveP09RecognizedListDto {
    @IsString()
    @MinLength(20)
    @MaxLength(2000)
    approval_note!: string;
}

export class IssueP09RecognizedListDto {
    @IsString()
    @MinLength(36)
    @MaxLength(36)
    signed_file_id!: string;

    @IsString()
    @MinLength(20)
    @MaxLength(2000)
    issue_note!: string;
}

import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class VerifyF18EvidenceDto {
    @IsUUID('4')
    signed_file_id!: string;

    @IsString()
    @MinLength(20)
    @MaxLength(2000)
    verification_note!: string;
}

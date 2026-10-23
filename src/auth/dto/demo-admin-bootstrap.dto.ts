import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class DemoAdminBootstrapDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._-]{3,50}$/)
  username!: string;

  @IsEmail()
  @MaxLength(255)
  @Matches(/@example\.invalid$/i)
  email!: string;

  @IsString()
  @MinLength(16)
  @MaxLength(100)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  full_name!: string;
}

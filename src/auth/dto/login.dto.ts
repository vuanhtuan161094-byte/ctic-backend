import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
    @ApiProperty({
        example: 'admin',
        description: 'Tên đăng nhập',
        maxLength: 50,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    username!: string;

    @ApiProperty({
        example: 'YourPassword',
        description: 'Mật khẩu tài khoản',
        format: 'password',
        maxLength: 100,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    password!: string;
}

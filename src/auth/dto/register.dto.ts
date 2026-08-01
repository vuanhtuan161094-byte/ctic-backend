import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
    @ApiProperty({
        example: 'staff01',
        description: 'Tên đăng nhập',
    })
    @IsNotEmpty()
    username!: string;

    @ApiProperty({
        example: 'staff01@ctic.vn',
        description: 'Địa chỉ email',
        format: 'email',
    })
    @IsEmail()
    email!: string;

    @ApiProperty({
        example: 'StrongPassword123!',
        description: 'Mật khẩu, tối thiểu 6 ký tự',
        format: 'password',
        minLength: 6,
    })
    @MinLength(6)
    password!: string;

    @ApiProperty({
        example: 'Nguyễn Văn A',
        description: 'Họ và tên người dùng',
    })
    @IsNotEmpty()
    full_name!: string;
}

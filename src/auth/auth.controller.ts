import { Body, Controller, Post } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
@ApiTags('01. Xác thực')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('login')
    @ApiOperation({
        summary: 'Đăng nhập',
        description:
            'Đăng nhập bằng username và password để nhận JWT access token.',
    })
    @ApiOkResponse({
        description: 'Đăng nhập thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu đăng nhập không hợp lệ',
    })
    @ApiUnauthorizedResponse({
        description: 'Sai tài khoản, mật khẩu hoặc tài khoản bị khóa',
    })
    async login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }
    @Post('register')
    @ApiOperation({
        summary: 'Đăng ký tài khoản',
        description:
            'Tạo tài khoản mới. Tài khoản không tự được cấp quyền quản trị.',
    })
    @ApiCreatedResponse({
        description: 'Tạo tài khoản thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu đăng ký không hợp lệ',
    })
    @ApiConflictResponse({
        description: 'Username hoặc email đã tồn tại',
    })
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }
}

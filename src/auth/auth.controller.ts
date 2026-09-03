import {
    Body,
    Controller,
    Get,
    HttpException,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
    PublicRegistrationGuard,
} from '../security/public-registration.guard';
import {
    SecurityAuditService,
} from '../security/security-audit.service';
import {
    SecurityRateLimit,
} from '../security/security-rate-limit.decorator';
import {
    SecurityRateLimitGuard,
} from '../security/security-rate-limit.guard';
import type {
    SecurityRequest,
} from '../security/security-request';

@Controller('auth')
@ApiTags('01. Xác thực')
export class AuthController {
    constructor(
        private readonly authService:
            AuthService,

        private readonly securityAudit:
            SecurityAuditService,
    ) { }

    private statusCode(
        error: unknown,
    ) {
        return error instanceof
            HttpException
            ? error.getStatus()
            : 500;
    }

    @Post('login')
    @UseGuards(
        SecurityRateLimitGuard,
    )
    @SecurityRateLimit('login')
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
    @ApiTooManyRequestsResponse({
        description: 'Đăng nhập quá nhiều lần trong khoảng thời gian ngắn',
    })
    async login(
        @Body()
        dto: LoginDto,

        @Req()
        request: SecurityRequest,
    ) {
        const startedAt =
            Date.now();

        try {
            const result =
                await this.authService.login(
                    dto,
                );

            await this.securityAudit.write({
                userId:
                    result.user.id,
                action:
                    'AUTH_LOGIN',
                entityType:
                    'user',
                entityId:
                    result.user.id,
                outcome:
                    'success',
                statusCode:
                    200,
                durationMs:
                    Date.now() -
                    startedAt,
                ipAddress:
                    request.ip,
                userAgent:
                    request.get(
                        'user-agent',
                    ),
                requestId:
                    request.requestId,
            });

            return result;
        } catch (error) {
            await this.securityAudit.write({
                action:
                    'AUTH_LOGIN',
                outcome:
                    'failure',
                statusCode:
                    this.statusCode(
                        error,
                    ),
                durationMs:
                    Date.now() -
                    startedAt,
                ipAddress:
                    request.ip,
                userAgent:
                    request.get(
                        'user-agent',
                    ),
                requestId:
                    request.requestId,
            });

            throw error;
        }
    }


    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Ngữ cảnh truy cập hiện tại',
        description:
            'Trả về roles và effective permissions đã được JwtStrategy tính sau role grants và permission overrides. Endpoint chỉ là projection read-only cho UI; backend guards vẫn là authority.',
    })
    @ApiOkResponse({
        description: 'Ngữ cảnh truy cập của tài khoản đang đăng nhập',
    })
    @ApiUnauthorizedResponse({
        description: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
    })
    currentAccess(
        @Req()
        request: SecurityRequest,
    ) {
        return {
            user: {
                id: request.user?.userId ?? request.user?.id ?? request.user?.sub ?? null,
                username: request.user?.username ?? null,
                email: request.user?.email ?? null,
                roles: request.user?.roles ?? [],
                permissions: request.user?.permissions ?? [],
            },
        };
    }

    @Post('register')
    @UseGuards(
        SecurityRateLimitGuard,
        PublicRegistrationGuard,
    )
    @SecurityRateLimit('login')
    @ApiOperation({
        summary: 'Đăng ký tài khoản',
        description:
            'Mặc định bị tắt. Chỉ dùng khi PUBLIC_REGISTRATION_ENABLED=true; tài khoản nội bộ thông thường phải tạo qua Quản trị người dùng.',
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
    @ApiForbiddenResponse({
        description: 'Đăng ký tài khoản công khai đang tắt',
    })
    @ApiTooManyRequestsResponse({
        description: 'Quá nhiều yêu cầu đăng ký trong khoảng thời gian ngắn',
    })
    async register(
        @Body()
        dto: RegisterDto,

        @Req()
        request: SecurityRequest,
    ) {
        const startedAt =
            Date.now();

        try {
            const result =
                await this.authService.register(
                    dto,
                );

            await this.securityAudit.write({
                userId:
                    result.id,
                action:
                    'AUTH_REGISTER',
                entityType:
                    'user',
                entityId:
                    result.id,
                outcome:
                    'success',
                statusCode:
                    201,
                durationMs:
                    Date.now() -
                    startedAt,
                ipAddress:
                    request.ip,
                userAgent:
                    request.get(
                        'user-agent',
                    ),
                requestId:
                    request.requestId,
            });

            return result;
        } catch (error) {
            await this.securityAudit.write({
                action:
                    'AUTH_REGISTER',
                outcome:
                    'failure',
                statusCode:
                    this.statusCode(
                        error,
                    ),
                durationMs:
                    Date.now() -
                    startedAt,
                ipAddress:
                    request.ip,
                userAgent:
                    request.get(
                        'user-agent',
                    ),
                requestId:
                    request.requestId,
            });

            throw error;
        }
    }
}

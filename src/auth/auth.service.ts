import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async register(dto: RegisterDto) {
        const existed = await this.prisma.users.findFirst({
            where: {
                OR: [
                    { username: dto.username },
                    { email: dto.email },
                ],
            },
        });

        if (existed) {
            throw new BadRequestException('Username hoặc email đã tồn tại');
        }

        const password_hash = await bcrypt.hash(dto.password, 10);

        const user = await this.prisma.users.create({
            data: {
                username: dto.username,
                email: dto.email,
                password_hash,
                full_name: dto.full_name,
            },
        });

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            full_name: user.full_name,
        };
    }

    async login(dto: LoginDto) {
        const user = await this.prisma.users.findUnique({
            where: { username: dto.username },
            include: {
                user_roles: {
                    include: {
                        roles: true,
                    },
                },
            },
        });

        if (!user) {
            throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');
        }
        const status =
            (
                user.status ??
                'active'
            )
                .trim()
                .toLowerCase();

        if (
            status !==
            'active'
        ) {
            throw new UnauthorizedException(
                'Tài khoản đã bị khóa hoặc ngừng hoạt động',
            );
        }

        if (
            user.locked_until &&
            user.locked_until >
            new Date()
        ) {
            throw new UnauthorizedException(
                'Tài khoản đang bị khóa tạm thời',
            );
        }
        const passwordValid =
            await bcrypt.compare(
                dto.password,
                user.password_hash,
            );

        if (!passwordValid) {
            const failedLoginCount =
                (
                    user.failed_login_count ??
                    0
                ) + 1;

            const shouldLock =
                failedLoginCount >= 5;

            await this.prisma.users.update({
                where: {
                    id:
                        user.id,
                },

                data: {
                    failed_login_count:
                        shouldLock
                            ? 0
                            : failedLoginCount,

                    locked_until:
                        shouldLock
                            ? new Date(
                                Date.now() +
                                15 *
                                60 *
                                1000,
                            )
                            : user.locked_until,
                },
            });

            throw new UnauthorizedException(
                shouldLock
                    ? 'Tài khoản bị khóa 15 phút do đăng nhập sai nhiều lần'
                    : 'Sai tài khoản hoặc mật khẩu',
            );
        }

        if (
            (
                user.failed_login_count ??
                0
            ) > 0 ||
            user.locked_until
        ) {
            await this.prisma.users.update({
                where: {
                    id:
                        user.id,
                },

                data: {
                    failed_login_count:
                        0,

                    locked_until:
                        null,
                },
            });
        }

        const roles = user.user_roles.map((ur) => ur.roles.role_name);

        const payload = {
            sub: user.id,
            username: user.username,
            email: user.email,
            roles,
        };

        const accessToken = await this.jwtService.signAsync(payload);

        return {
            access_token: accessToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                roles,
            },
        };
    }
}
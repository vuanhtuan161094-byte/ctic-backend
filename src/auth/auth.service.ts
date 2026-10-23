import {
    Injectable,
    UnauthorizedException,
    BadRequestException,
    ConflictException,
    ForbiddenException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { RegisterDto } from './dto/register.dto';
import { DemoAdminBootstrapDto } from './dto/demo-admin-bootstrap.dto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
    ) { }

    async bootstrapDemoAdmin(
        dto: DemoAdminBootstrapDto,
        suppliedToken: string | undefined,
        remoteAddress: string | undefined,
    ) {
        if (process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED !== 'true') {
            throw new ForbiddenException('Thiết lập tài khoản quản trị ban đầu đang tắt');
        }

        const address = String(remoteAddress ?? '').replace(/^::ffff:/i, '');
        if (!['127.0.0.1', '::1'].includes(address)) {
            throw new ForbiddenException('Chỉ cho phép thiết lập ban đầu từ máy cục bộ');
        }

        const expectedToken = String(process.env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN ?? '');
        if (expectedToken.length < 32 || !this.matchesSecret(expectedToken, suppliedToken)) {
            throw new UnauthorizedException('Mã thiết lập ban đầu không hợp lệ');
        }

        const [identity] = await this.prisma.$queryRaw<Array<{
            database_name: string;
            sql_machine: string;
            sql_instance: string;
        }>>`
            SELECT
              DB_NAME() AS database_name,
              CONVERT(nvarchar(128), SERVERPROPERTY('MachineName')) AS sql_machine,
              CONVERT(nvarchar(128), SERVERPROPERTY('InstanceName')) AS sql_instance
        `;
        if (
            identity?.database_name !== 'CTIC_CMP_DEMO_2026' ||
            identity?.sql_machine?.toUpperCase() !== 'CTIC-LP-054' ||
            identity?.sql_instance?.toUpperCase() !== 'SQLEXPRESS'
        ) {
            throw new ForbiddenException('Chỉ cho phép thiết lập ban đầu trong đúng SQL sandbox CMP DEMO');
        }

        const roleRows = await this.prisma.roles.findMany({
            select: { id: true, role_name: true },
        });
        const adminRole = roleRows.find((role) => role.role_name.trim().toUpperCase() === 'ADMIN');
        if (!adminRole) {
            throw new ServiceUnavailableException('Vai trò hệ thống chưa được khởi tạo');
        }

        const username = dto.username.trim().toLowerCase();
        const email = dto.email.trim().toLowerCase();
        const fullName = dto.full_name.trim();
        if (!username || !fullName) {
            throw new BadRequestException('Tên đăng nhập và họ tên không được để trống');
        }
        if (!email.endsWith('@example.invalid')) {
            throw new BadRequestException('Tài khoản DEMO chỉ được dùng email thuộc example.invalid');
        }

        const result = await this.prisma.$transaction(async (tx) => {
            const lockRows = await tx.$queryRawUnsafe<Array<{ lock_result: number }>>(
                "DECLARE @lock_result int; EXEC @lock_result = sp_getapplock @Resource=N'CMP_DEMO_INITIAL_ADMIN', @LockMode=N'Exclusive', @LockOwner=N'Transaction', @LockTimeout=5000; SELECT @lock_result AS lock_result",
            );
            const lockResult = Number(lockRows?.[0]?.lock_result);
            if (!Number.isInteger(lockResult) || lockResult < 0) {
                throw new ConflictException('Đang có một lượt thiết lập tài khoản quản trị khác');
            }

            const priorBootstrap = await tx.audit_logs.findFirst({
                where: { action: 'DEMO_INITIAL_ADMIN_BOOTSTRAPPED' },
                select: { id: true },
            });
            if (priorBootstrap) {
                throw new ConflictException('Tài khoản quản trị ban đầu đã được thiết lập');
            }

            const existingAdmin = await tx.user_roles.findFirst({
                where: { role_id: adminRole.id },
                select: { user_id: true },
            });
            if (existingAdmin) {
                throw new ConflictException('Cơ sở dữ liệu đã có tài khoản quản trị');
            }

            const existingUser = await tx.users.findFirst({
                where: { OR: [{ username }, { email }] },
                select: { id: true },
            });
            if (existingUser) {
                throw new ConflictException('Tên đăng nhập hoặc email đã tồn tại');
            }

            const passwordHash = await bcrypt.hash(dto.password, 12);
            const user = await tx.users.create({
                data: {
                    username,
                    email,
                    password_hash: passwordHash,
                    full_name: fullName,
                    status: 'active',
                },
                select: { id: true, username: true, email: true, full_name: true },
            });
            await tx.user_roles.create({
                data: { user_id: user.id, role_id: adminRole.id },
            });
            await tx.audit_logs.create({
                data: {
                    user_id: user.id,
                    action: 'DEMO_INITIAL_ADMIN_BOOTSTRAPPED',
                    entity_type: 'user',
                    entity_id: user.id,
                    outcome: 'success',
                    status_code: 201,
                    details_json: JSON.stringify({ database: 'CTIC_CMP_DEMO_2026', source: 'loopback_one_time_bootstrap' }),
                },
            });
            return user;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

        process.env.CMP_DEMO_ADMIN_BOOTSTRAP_ENABLED = 'false';
        process.env.CMP_DEMO_ADMIN_BOOTSTRAP_TOKEN = '';
        return { ...result, roles: ['ADMIN'] };
    }

    private matchesSecret(expected: string, supplied: string | undefined) {
        const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
        const suppliedDigest = createHash('sha256').update(String(supplied ?? ''), 'utf8').digest();
        return timingSafeEqual(expectedDigest, suppliedDigest);
    }

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

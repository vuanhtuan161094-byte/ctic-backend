import {
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';

import { DashboardService } from '../dashboard/dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
    private readonly logger =
        new Logger(
            NotificationsService.name,
        );

    constructor(
        private readonly prisma:
            PrismaService,
        private readonly dashboardService:
            DashboardService,
    ) { }

    private normalizeWarningDays(
        warningDays: number,
    ) {
        if (
            !Number.isFinite(
                warningDays,
            )
        ) {
            return 90;
        }

        return Math.min(
            Math.max(
                Math.trunc(
                    warningDays,
                ),
                1,
            ),
            365,
        );
    }

    private normalizeLimit(
        limit: number,
    ) {
        if (
            !Number.isFinite(
                limit,
            )
        ) {
            return 50;
        }

        return Math.min(
            Math.max(
                Math.trunc(
                    limit,
                ),
                1,
            ),
            200,
        );
    }

    private normalizeStatus(
        status?: string,
    ) {
        const safeStatus =
            status
                ?.trim()
                .toLowerCase();

        if (
            safeStatus === 'unread' ||
            safeStatus === 'read' ||
            safeStatus === 'resolved'
        ) {
            return safeStatus;
        }

        return 'all';
    }

    async create(
        dto: CreateNotificationDto,
    ) {
        const user =
            await this.prisma.users.findUnique({
                where: {
                    id: dto.user_id,
                },
                select: {
                    id: true,
                    status: true,
                },
            });

        if (!user) {
            throw new NotFoundException(
                'Không tìm thấy tài khoản nhận thông báo',
            );
        }

        return this.prisma.notifications.create({
            data: {
                user_id:
                    dto.user_id,

                source_key:
                    `manual:${randomUUID()}`,

                notification_type:
                    dto.notification_type
                        .trim()
                        .toLowerCase(),

                title:
                    dto.title.trim(),

                message:
                    dto.message.trim(),

                severity:
                    dto.severity
                        ?.trim()
                        .toLowerCase() ??
                    'info',

                entity_type:
                    dto.entity_type
                        ?.trim()
                        .toLowerCase() ??
                    null,

                entity_id:
                    dto.entity_id ??
                    null,

                due_date:
                    dto.due_date
                        ? new Date(
                            dto.due_date,
                        )
                        : null,

                status:
                    'unread',
            },
        });
    }

    async getUnreadSummary(
        userId: string,
    ) {
        const [
            total,
            critical,
            warning,
            info,
        ] = await Promise.all([
            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                },
            }),

            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                    severity: 'critical',
                },
            }),

            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                    severity: 'warning',
                },
            }),

            this.prisma.notifications.count({
                where: {
                    user_id: userId,
                    status: 'unread',
                    severity: 'info',
                },
            }),
        ]);

        return {
            total,
            critical,
            warning,
            info,
        };
    }

    async findForUser(
        userId: string,
        status?: string,
        limit = 50,
    ) {
        const safeStatus =
            this.normalizeStatus(
                status,
            );

        const safeLimit =
            this.normalizeLimit(
                limit,
            );

        const items =
            await this.prisma.notifications.findMany({
                where: {
                    user_id: userId,

                    ...(safeStatus !== 'all'
                        ? {
                            status:
                                safeStatus,
                        }
                        : {}),
                },

                orderBy: [
                    {
                        status: 'asc',
                    },
                    {
                        created_at:
                            'desc',
                    },
                ],

                take: safeLimit,
            });

        const summary =
            await this.getUnreadSummary(
                userId,
            );

        return {
            summary,
            filter: {
                status:
                    safeStatus,
                limit:
                    safeLimit,
            },
            items,
        };
    }

    async markRead(
        id: string,
        userId: string,
    ) {
        const notification =
            await this.prisma.notifications.findFirst({
                where: {
                    id,
                    user_id: userId,
                },
            });

        if (!notification) {
            throw new NotFoundException(
                'Không tìm thấy thông báo',
            );
        }

        if (
            notification.status ===
            'resolved'
        ) {
            return notification;
        }

        return this.prisma.notifications.update({
            where: {
                id,
            },
            data: {
                status:
                    'read',
                read_at:
                    new Date(),
            },
        });
    }

    async markAllRead(
        userId: string,
    ) {
        const result =
            await this.prisma.notifications.updateMany({
                where: {
                    user_id:
                        userId,
                    status:
                        'unread',
                },
                data: {
                    status:
                        'read',
                    read_at:
                        new Date(),
                },
            });

        return {
            message:
                'Đã đánh dấu tất cả thông báo là đã đọc',
            updated_count:
                result.count,
        };
    }

    private async getInternalRecipients() {
        const users =
            await this.prisma.users.findMany({
                where: {
                    status:
                        'active',
                },

                include: {
                    user_roles: {
                        include: {
                            roles:
                                true,
                        },
                    },
                },
            });

        const internalRoles =
            new Set([
                'ADMIN',
                'STAFF',
                'COORDINATOR',
                'LEAD_AUDITOR',
                'AUDITOR',
                'TECHNICAL_REVIEWER',
                'DECISION_MAKER',
            ]);

        return users.filter(
            (user) =>
                user.user_roles.some(
                    (userRole) =>
                        internalRoles.has(
                            userRole.roles.role_name
                                .trim()
                                .toUpperCase(),
                        ),
                ),
        );
    }

    async generateReminders(
        warningDays = 90,
    ) {
        const safeWarningDays =
            this.normalizeWarningDays(
                warningDays,
            );

        const [
            dashboardResult,
            recipients,
        ] = await Promise.all([
            this.dashboardService.getAlerts(
                safeWarningDays,
            ),

            this.getInternalRecipients(),
        ]);

        const alerts =
            dashboardResult.alerts;

        let created = 0;
        let updated = 0;
        let reopened = 0;
        let resolved = 0;

        for (
            const recipient
            of recipients
        ) {
            const prefix =
                `dashboard:${recipient.id}:`;

            const activeSourceKeys:
                string[] = [];

            for (
                const alert
                of alerts
            ) {
                const sourceKey =
                    `${prefix}${alert.id}`;

                activeSourceKeys.push(
                    sourceKey,
                );

                const existing =
                    await this.prisma.notifications.findUnique({
                        where: {
                            source_key:
                                sourceKey,
                        },
                    });

                const commonData = {
                    notification_type:
                        alert.alert_type,

                    title:
                        alert.title,

                    message:
                        alert.message,

                    severity:
                        alert.severity,

                    entity_type:
                        alert.entity_type,

                    entity_id:
                        alert.entity_id,

                    due_date:
                        alert.due_date,
                };

                if (!existing) {
                    await this.prisma.notifications.create({
                        data: {
                            user_id:
                                recipient.id,

                            source_key:
                                sourceKey,

                            ...commonData,

                            status:
                                'unread',
                        },
                    });

                    created++;
                    continue;
                }

                if (
                    existing.status ===
                    'resolved'
                ) {
                    await this.prisma.notifications.update({
                        where: {
                            id:
                                existing.id,
                        },
                        data: {
                            ...commonData,

                            status:
                                'unread',

                            read_at:
                                null,
                        },
                    });

                    reopened++;
                    continue;
                }

                await this.prisma.notifications.update({
                    where: {
                        id:
                            existing.id,
                    },
                    data:
                        commonData,
                });

                updated++;
            }

            const obsoleteWhere = {
                user_id:
                    recipient.id,

                source_key: {
                    startsWith:
                        prefix,

                    ...(activeSourceKeys.length > 0
                        ? {
                            notIn:
                                activeSourceKeys,
                        }
                        : {}),
                },

                status: {
                    not:
                        'resolved',
                },
            };

            const resolvedResult =
                await this.prisma.notifications.updateMany({
                    where:
                        obsoleteWhere,

                    data: {
                        status:
                            'resolved',

                        read_at:
                            new Date(),
                    },
                });

            resolved +=
                resolvedResult.count;
        }

        return {
            generated_at:
                new Date(),

            warning_days:
                safeWarningDays,

            recipients:
                recipients.length,

            active_alerts:
                alerts.length,

            created,
            updated,
            reopened,
            resolved,
        };
    }

    @Cron(
        '0 0 7 * * *',
        {
            timeZone:
                'Asia/Ho_Chi_Minh',
        },
    )
    async generateDailyReminders() {
        try {
            const result =
                await this.generateReminders(
                    90,
                );

            this.logger.log(
                `Đã tạo nhắc hạn: ${JSON.stringify(
                    result,
                )}`,
            );
        } catch (error) {
            this.logger.error(
                'Không thể tạo thông báo nhắc hạn tự động',
                error instanceof Error
                    ? error.stack
                    : String(error),
            );
        }
    }
}
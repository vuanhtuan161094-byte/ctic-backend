import {
    Injectable,
    NotFoundException,
} from '@nestjs/common';

import type {
    Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AuditLogsService {
    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    private parseDetails(value: string | null) {
        if (!value) return null;
        try {
            return JSON.parse(value) as unknown;
        } catch {
            return null;
        }
    }

    private parseStartDate(
        value?: string,
    ) {
        if (!value) {
            return undefined;
        }

        return new Date(
            value,
        );
    }

    private parseEndDate(
        value?: string,
    ) {
        if (!value) {
            return undefined;
        }

        const date =
            new Date(
                value,
            );

        if (
            /^\d{4}-\d{2}-\d{2}$/.test(
                value,
            )
        ) {
            date.setUTCHours(
                23,
                59,
                59,
                999,
            );
        }

        return date;
    }

    private buildWhere(
        query: AuditLogQueryDto,
    ): Prisma.audit_logsWhereInput {
        const startDate =
            this.parseStartDate(
                query.date_from,
            );

        const endDate =
            this.parseEndDate(
                query.date_to,
            );

        return {
            user_id:
                query.user_id,

            action:
                query.action
                    ?.trim()
                    ? {
                        contains:
                            query.action.trim(),
                    }
                    : undefined,

            entity_type:
                query.entity_type
                    ?.trim() ||
                undefined,

            entity_id:
                query.entity_id,

            outcome:
                query.outcome,

            status_code:
                query.status_code,

            request_id:
                query.request_id
                    ?.trim()
                    ? {
                        contains:
                            query.request_id.trim(),
                    }
                    : undefined,

            created_at:
                startDate ||
                    endDate
                    ? {
                        gte:
                            startDate,

                        lte:
                            endDate,
                    }
                    : undefined,
        };
    }

    async findAll(
        query: AuditLogQueryDto,
    ) {
        const page =
            query.page || 1;

        const limit =
            query.limit || 50;

        const skip =
            (
                page - 1
            ) * limit;

        const where =
            this.buildWhere(
                query,
            );

        const [
            total,
            items,
        ] =
            await Promise.all([
                this.prisma.audit_logs.count({
                    where,
                }),

                this.prisma.audit_logs.findMany({
                    where,

                    skip,

                    take:
                        limit,

                    orderBy: {
                        created_at:
                            'desc',
                    },

                    include: {
                        users: {
                            select: {
                                id:
                                    true,

                                username:
                                    true,

                                full_name:
                                    true,

                                email:
                                    true,
                            },
                        },
                    },
                }),
            ]);

        return {
            page,
            limit,
            total,

            total_pages:
                Math.ceil(
                    total /
                    limit,
                ),

            items:
                items.map(
                    (item) => ({
                        id:
                            item.id,

                        action:
                            item.action,

                        entity_type:
                            item.entity_type,

                        entity_id:
                            item.entity_id,

                        ip_address:
                            item.ip_address,

                        user_agent:
                            item.user_agent,

                        request_id:
                            item.request_id,

                        outcome:
                            item.outcome,

                        status_code:
                            item.status_code,

                        duration_ms:
                            item.duration_ms,

                        details:
                            this.parseDetails(item.details_json),

                        created_at:
                            item.created_at,

                        user:
                            item.users,
                    }),
                ),
        };
    }
    private getGroupedCount(
        value: unknown,
    ): number {
        if (
            typeof value !==
            'object' ||
            value === null ||
            !(
                'id' in
                value
            )
        ) {
            return 0;
        }

        const idCount =
            (
                value as {
                    id?: unknown;
                }
            ).id;

        return typeof idCount ===
            'number'
            ? idCount
            : 0;
    }
    async getSummary(
        query: AuditLogQueryDto,
    ) {
        const where =
            this.buildWhere(
                query,
            );

        const [
            total,
            byAction,
            byEntityType,
            byOutcome,
            recentItems,
        ] =
            await this.prisma.$transaction([
                this.prisma.audit_logs.count({
                    where,
                }),

                this.prisma.audit_logs.groupBy({
                    by: [
                        'action',
                    ],

                    where,

                    orderBy: {
                        action:
                            'asc',
                    },

                    _count: {
                        id:
                            true,
                    },
                }),

                this.prisma.audit_logs.groupBy({
                    by: [
                        'entity_type',
                    ],

                    where,

                    orderBy: {
                        entity_type:
                            'asc',
                    },

                    _count: {
                        id:
                            true,
                    },
                }),

                this.prisma.audit_logs.groupBy({
                    by: [
                        'outcome',
                    ],

                    where,

                    orderBy: {
                        outcome:
                            'asc',
                    },

                    _count: {
                        id:
                            true,
                    },
                }),

                this.prisma.audit_logs.findMany({
                    where,

                    take:
                        10,

                    orderBy: {
                        created_at:
                            'desc',
                    },

                    include: {
                        users: {
                            select: {
                                id:
                                    true,

                                username:
                                    true,

                                full_name:
                                    true,
                            },
                        },
                    },
                }),
            ]);

        return {
            total,

            by_action:
                byAction
                    .map(
                        (item) => ({
                            action:
                                item.action,

                            count:
                                this.getGroupedCount(
                                    item._count,
                                ),
                        }),
                    )
                    .sort(
                        (
                            left,
                            right,
                        ) =>
                            right.count -
                            left.count,
                    ),

            by_entity_type:
                byEntityType
                    .map(
                        (item) => ({
                            entity_type:
                                item.entity_type ??
                                'unknown',

                            count:
                                this.getGroupedCount(
                                    item._count,
                                ),
                        }),
                    )
                    .sort(
                        (
                            left,
                            right,
                        ) =>
                            right.count -
                            left.count,
                    ),

            by_outcome:
                byOutcome
                    .map(
                        (item) => ({
                            outcome:
                                item.outcome ??
                                'legacy',

                            count:
                                this.getGroupedCount(
                                    item._count,
                                ),
                        }),
                    )
                    .sort(
                        (left, right) =>
                            right.count -
                            left.count,
                    ),

            recent_items:
                recentItems.map(
                    (item) => ({
                        id:
                            item.id,

                        action:
                            item.action,

                        entity_type:
                            item.entity_type,

                        entity_id:
                            item.entity_id,

                        request_id:
                            item.request_id,

                        outcome:
                            item.outcome,

                        status_code:
                            item.status_code,

                        duration_ms:
                            item.duration_ms,

                        created_at:
                            item.created_at,

                        user:
                            item.users,
                    }),
                ),
        };
    }

    async findOne(
        id: string,
    ) {
        const auditLog =
            await this.prisma.audit_logs.findUnique({
                where: {
                    id,
                },

                include: {
                    users: {
                        select: {
                            id:
                                true,

                            username:
                                true,

                            full_name:
                                true,

                            email:
                                true,
                        },
                    },
                },
            });

        if (!auditLog) {
            throw new NotFoundException(
                'Không tìm thấy audit log',
            );
        }

        return {
            id:
                auditLog.id,

            action:
                auditLog.action,

            entity_type:
                auditLog.entity_type,

            entity_id:
                auditLog.entity_id,

            ip_address:
                auditLog.ip_address,

            user_agent:
                auditLog.user_agent,

            request_id:
                auditLog.request_id,

            outcome:
                auditLog.outcome,

            status_code:
                auditLog.status_code,

            duration_ms:
                auditLog.duration_ms,

            details:
                this.parseDetails(auditLog.details_json),

            created_at:
                auditLog.created_at,

            user:
                auditLog.users,
        };
    }
}

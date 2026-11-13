import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from '@nestjs/common';
import type {
    Prisma,
} from '@prisma/client';

import {
    PrismaService,
} from '../prisma/prisma.service';
import {
    hasPreparedAuditPlan,
} from '../audit-plans/audit-cycle-workflow';
import {
    resolveCanonicalOperationalPlans,
} from '../audit-plans/audit-plan-canonical';
import {
    normalizeRoles,
} from '../security/security-request';
import {
    ResourceAccessService,
} from '../security/resource-access.service';
import {
    NotificationEngineService,
} from '../notifications/notification-engine.service';
import { DelegationsService } from '../delegations/delegations.service';
import {
    evaluateWorkItemSla,
    getWorkItemSlaPolicy,
} from '../notifications/work-item-sla-policy';
import {
    hasSignificantSurveillanceChange,
} from '../surveillance-information/surveillance-workflow';
import {
    ActionAuthorizationService,
} from './action-authorization.service';
import {
    CERTIFICATE_VERSION_DECISIONS,
    WORK_ITEM_ACTIONS,
    WORK_ITEM_PRIORITIES,
    WORK_ITEM_STATUSES,
    WORK_ITEM_TYPES,
    type WorkItemPriority,
    type WorkItemStatus,
    type WorkItemType,
} from './work-item.constants';

type WorkItemDatabaseClient =
    Pick<
        Prisma.TransactionClient,
        'work_items'
    >;

export interface OpenWorkItemInput {
    sourceKey: string;
    workType: WorkItemType;
    actionCode: string;
    title: string;
    description?: string | null;
    entityType: string;
    entityId: string;
    projectId?: string | null;
    auditEventId?: string | null;
    auditPlanId?: string | null;
    cycleKey?: string | null;
    assignedUserId?: string | null;
    assignedRole?: string | null;
    priority?: WorkItemPriority;
    dueAt?: Date | null;
    availableAt?: Date | null;
    destinationPath?: string | null;
    context?: Record<string, unknown> | null;
}

export interface MyWorkQuery {
    status?: string;
    priority?: string;
    work_type?: string;
    due?: string;
    limit?: string;
    page?: string;
    search?: string;
}

@Injectable()
export class WorkItemsService {
    private readonly logger =
        new Logger(
            WorkItemsService.name,
        );

    constructor(
        private readonly prisma:
            PrismaService,
        private readonly authorization:
            ActionAuthorizationService,
        private readonly resourceAccess:
            ResourceAccessService,
        @Optional()
        private readonly notifications?:
            NotificationEngineService,
        @Optional()
        private readonly delegations?:
            DelegationsService,
    ) { }

    private database(
        transaction?: WorkItemDatabaseClient,
    ) {
        return transaction ??
            this.prisma;
    }

    private requiredText(
        value: string,
        field: string,
        maximum: number,
    ) {
        const normalized =
            value?.trim();

        if (!normalized) {
            throw new BadRequestException(
                `${field} là bắt buộc`,
            );
        }

        if (normalized.length > maximum) {
            throw new BadRequestException(
                `${field} vượt quá ${maximum} ký tự`,
            );
        }

        return normalized;
    }

    private normalizeRole(
        role?: string | null,
    ) {
        return role
            ?.trim()
            .toUpperCase() ||
            null;
    }

    async openWorkItem(
        input: OpenWorkItemInput,
        transaction?: WorkItemDatabaseClient,
    ) {
        const sourceKey =
            this.requiredText(
                input.sourceKey,
                'source_key',
                200,
            );
        const assignedRole =
            this.normalizeRole(
                input.assignedRole,
            );

        if (
            !input.assignedUserId &&
            !assignedRole
        ) {
            throw new BadRequestException(
                'Work item phải được giao cho người dùng hoặc vai trò',
            );
        }

        const data = {
            work_type:
                input.workType,
            action_code:
                this.requiredText(
                    input.actionCode,
                    'action_code',
                    100,
                ).toLowerCase(),
            title:
                this.requiredText(
                    input.title,
                    'title',
                    255,
                ),
            description:
                input.description?.trim() ||
                null,
            entity_type:
                this.requiredText(
                    input.entityType,
                    'entity_type',
                    80,
                ).toLowerCase(),
            entity_id:
                this.requiredText(
                    input.entityId,
                    'entity_id',
                    100,
                ),
            project_id:
                input.projectId ??
                null,
            audit_event_id:
                input.auditEventId ??
                null,
            audit_plan_id:
                input.auditPlanId ??
                null,
            cycle_key:
                input.cycleKey?.trim() ||
                null,
            assigned_user_id:
                input.assignedUserId ??
                null,
            assigned_role:
                assignedRole,
            priority:
                input.priority ??
                'NORMAL',
            due_at:
                input.dueAt ??
                null,
            available_at:
                input.availableAt ??
                null,
            destination_path:
                input.destinationPath?.trim() ||
                null,
            context_json:
                input.context
                    ? JSON.stringify(
                        input.context,
                    )
                    : null,
            updated_at:
                new Date(),
        };

        const item =
            await this.database(
            transaction,
        ).work_items.upsert({
            where: {
                source_key:
                    sourceKey,
            },
            create: {
                source_key:
                    sourceKey,
                ...data,
                status:
                    'OPEN',
            },
            update:
                data,
        });

        if (
            !transaction &&
            this.notifications
        ) {
            try {
                await this.notifications
                    .notifyWorkAssigned(
                        item,
                    );
            } catch (error) {
                this.logger.warn(
                    `Work item ${item.id} opened but assignment notification will be retried by reconciliation: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        return item;
    }

    async completeWorkItem(
        reference: {
            id?: string;
            sourceKey?: string;
        },
        completedBy?: string | null,
        transaction?: WorkItemDatabaseClient,
    ) {
        const where =
            reference.id
                ? {
                    id:
                        reference.id,
                }
                : reference.sourceKey
                    ? {
                        source_key:
                            reference.sourceKey,
                    }
                    : null;

        if (!where) {
            throw new BadRequestException(
                'Phải chỉ định id hoặc source_key của work item',
            );
        }

        const database =
            this.database(
                transaction,
            );
        const item =
            await database.work_items.findUnique({
                where,
            });

        if (!item) {
            return null;
        }

        if (item.status === 'DONE') {
            return item;
        }

        return database.work_items.update({
            where: {
                id:
                    item.id,
            },
            data: {
                status:
                    'DONE',
                completed_at:
                    new Date(),
                completed_by:
                    completedBy ??
                    null,
                cancelled_at:
                    null,
                updated_at:
                    new Date(),
            },
        });
    }

    async cancelWorkItem(
        reference: {
            id?: string;
            sourceKey?: string;
        },
        transaction?: WorkItemDatabaseClient,
    ) {
        const where =
            reference.id
                ? {
                    id:
                        reference.id,
                }
                : reference.sourceKey
                    ? {
                        source_key:
                            reference.sourceKey,
                    }
                    : null;

        if (!where) {
            throw new BadRequestException(
                'Phải chỉ định id hoặc source_key của work item',
            );
        }

        const database =
            this.database(
                transaction,
            );
        const item =
            await database.work_items.findUnique({
                where,
            });

        if (!item) {
            return null;
        }

        if (
            item.status === 'DONE' ||
            item.status === 'CANCELLED'
        ) {
            return item;
        }

        return database.work_items.update({
            where: {
                id:
                    item.id,
            },
            data: {
                status:
                    'CANCELLED',
                cancelled_at:
                    new Date(),
                updated_at:
                    new Date(),
            },
        });
    }

    async completeMatchingWorkItems(
        input: {
            actionCode: string;
            entityType: string;
            entityId: string;
        },
        completedBy?: string | null,
        transaction?: WorkItemDatabaseClient,
    ) {
        return this.database(
            transaction,
        ).work_items.updateMany({
            where: {
                action_code:
                    input.actionCode
                        .trim()
                        .toLowerCase(),
                entity_type:
                    input.entityType
                        .trim()
                        .toLowerCase(),
                entity_id:
                    input.entityId,
                status: {
                    in: [
                        'OPEN',
                        'IN_PROGRESS',
                    ],
                },
            },
            data: {
                status:
                    'DONE',
                completed_at:
                    new Date(),
                completed_by:
                    completedBy ??
                    null,
                updated_at:
                    new Date(),
            },
        });
    }

    private enumFilter<T extends string>(
        value: string | undefined,
        allowed: readonly T[],
        field: string,
    ): T | undefined {
        if (!value) {
            return undefined;
        }

        const normalized =
            value
                .trim()
                .toUpperCase() as T;

        if (!allowed.includes(normalized)) {
            throw new BadRequestException(
                `Bộ lọc ${field} không hợp lệ`,
            );
        }

        return normalized;
    }

    private parseContext(
        value?: string | null,
    ) {
        if (!value) {
            return null;
        }

        try {
            const parsed: unknown =
                JSON.parse(value);

            return parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
                ? parsed
                : null;
        } catch {
            return null;
        }
    }

    async getMyWork(
        user: {
            userId: string;
            roles: string[];
        },
        query: MyWorkQuery,
    ) {
        const roles =
            normalizeRoles(
                user.roles,
            );
        const status =
            this.enumFilter(
                query.status,
                WORK_ITEM_STATUSES,
                'status',
            );
        const priority =
            this.enumFilter(
                priorityImportant ? undefined : query.priority,
                WORK_ITEM_PRIORITIES,
                'priority',
            );
        const workType =
            this.enumFilter(
                query.work_type,
                WORK_ITEM_TYPES,
                'work_type',
            );
        const page = query.page === undefined ? 1 : Number(query.page);
        if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) {
            throw new BadRequestException('Trang công việc không hợp lệ');
        }
        const rawSearch = query.search?.trim() ?? '';
        if (rawSearch.length > 100) {
            throw new BadRequestException('Từ khóa tối đa 100 ký tự');
        }
        const search = rawSearch.toLocaleLowerCase('vi');
        // Preserve existing lightweight dashboard callers; explicit paging/search
        // scans all candidate batches before resource-scope filtering and counts.
        const paginated = query.page !== undefined || query.search !== undefined;
        const priorityImportant = query.priority?.trim().toUpperCase() === 'IMPORTANT';
        const limit =
            Math.min(
                Math.max(
                    Number.parseInt(
                        query.limit ??
                        '200',
                        10,
                    ) || 200,
                    1,
                ),
                200,
            );
        const now =
            new Date();
        const activeDelegations =
            this.delegations
                ? await this.delegations.activeForDelegate(
                    user.userId,
                    now,
                )
                : [];
        const delegatedFromIds =
            Array.from(new Set(activeDelegations.map((item) => item.delegatorUserId)));
        const dueSoon =
            new Date(
                now.getTime() +
                7 * 24 * 60 * 60 * 1000,
            );
        const dueFilter =
            query.due
                ?.trim()
                .toLowerCase();

        if (
            dueFilter &&
            ![
                'overdue',
                'due_soon',
                'no_due',
            ].includes(dueFilter)
        ) {
            throw new BadRequestException(
                'Bộ lọc due không hợp lệ',
            );
        }

        const loadChunk = (skip: number) =>
            this.prisma.work_items.findMany({
                where: {
                    AND: [
                        ...(!roles.includes('ADMIN')
                            ? [{
                                OR: [
                                    {
                                        assigned_user_id:
                                            user.userId,
                                    },
                                    {
                                        assigned_user_id:
                                            null,
                                        assigned_role: {
                                            in:
                                                roles,
                                            },
                                    },
                                    ...(delegatedFromIds.length
                                        ? [{ assigned_user_id: { in: delegatedFromIds } }]
                                        : []),
                                ],
                            }]
                            : []),
                        {
                            OR: [
                                {
                                    available_at:
                                        null,
                                },
                                {
                                    available_at: {
                                        lte:
                                            now,
                                    },
                                },
                            ],
                        },
                    ],
                    status:
                        status ??
                        {
                            in: [
                                'OPEN',
                                'IN_PROGRESS',
                            ],
                        },
                    ...(priorityImportant ? { priority: { in: ['HIGH', 'URGENT'] } } : priority ? { priority } : {}),
                    ...(workType
                        ? {
                            work_type:
                                workType,
                        }
                        : {}),
                    ...(dueFilter === 'overdue'
                        ? {
                            due_at: {
                                lt:
                                    now,
                            },
                        }
                        : dueFilter === 'due_soon'
                            ? {
                                due_at: {
                                    gte:
                                        now,
                                    lte:
                                        dueSoon,
                                },
                            }
                            : dueFilter === 'no_due'
                                ? {
                                    due_at:
                                        null,
                                }
                                : {}),
                },
                include: {
                    project: {
                        select: {
                            project_code:
                                true,
                            certification_applications: {
                                select: {
                                    customers: {
                                        select: {
                                            company_name:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    assigned_user: {
                        select: {
                            full_name:
                                true,
                            username:
                                true,
                        },
                    },
                },
                orderBy:
                    status === 'DONE'
                        ? [
                            {
                                completed_at:
                                    'desc',
                            },
                            {
                                updated_at:
                                    'desc',
                            },
                        ]
                        : [
                            {
                                priority:
                                    'desc',
                            },
                            {
                                due_at:
                                    'asc',
                            },
                            {
                                updated_at:
                                    'desc',
                            },
                        ],
                take: paginated ? 250 : Math.min(limit * 5, 1_000),
                ...(paginated ? { skip } : {}),
            });
        const items = await loadChunk(0);
        if (paginated) {
            // Authorization is not equivalent to assignment: never paginate raw
            // DB results, or a user may receive short/empty or unauthorized pages.
            for (let skip = 250; items.length >= skip; skip += 250) {
                const next = await loadChunk(skip);
                items.push(...next);
                if (next.length < 250) break;
            }
        }

        const projectIds =
            Array.from(
                new Set(
                    items
                        .map((item) =>
                            item.project_id,
                        )
                        .filter(
                            (projectId): projectId is string =>
                                Boolean(projectId),
                        ),
                ),
            );
        const scopedProjectIds =
            roles.includes('ADMIN')
                ? projectIds
                : await this.authorizationProjectScope(
                    projectIds,
                    user,
                );
        const scope =
            new Set(
                scopedProjectIds,
            );
        const entityScopedItems =
            roles.includes('ADMIN')
                ? items.filter((item) =>
                    !item.project_id,
                )
                : await this.resourceAccess
                    .filterEntities(
                        items
                            .filter((item) =>
                                !item.project_id,
                            )
                            .map((item) => ({
                                ...item,
                                entity_type:
                                    item.entity_type,
                                entity_id:
                                    item.entity_id,
                            })),
                        user,
                    );
        const entityScopedIds =
            new Set(
                entityScopedItems.map(
                    (item) =>
                        item.id,
                ),
            );
        const scopedItems =
            items.filter((item) => {
                const delegated = activeDelegations.some((delegation) =>
                    item.assigned_user_id === delegation.delegatorUserId &&
                    delegation.actions.includes(item.action_code) &&
                    (!delegation.projectId || delegation.projectId === item.project_id),
                );
                return delegated || (item.project_id
                    ? scope.has(
                        item.project_id,
                    )
                    : entityScopedIds.has(
                        item.id,
                    ));
            });

        const decisionReviewIds = scopedItems
            .filter((item) => item.action_code === WORK_ITEM_ACTIONS.CERTIFICATION_DECISION && item.entity_type === 'technical_review')
            .map((item) => item.entity_id);
        const decisionPlanIds = scopedItems
            .filter((item) => item.action_code === WORK_ITEM_ACTIONS.CERTIFICATION_DECISION && item.audit_plan_id)
            .map((item) => item.audit_plan_id!);
        const [ownReviews, delegatedReviews, auditMemberships] = await Promise.all([
            decisionReviewIds.length
                ? this.prisma.technical_reviews.findMany({
                    where: { id: { in: decisionReviewIds }, reviewer_id: user.userId },
                    select: { id: true },
                })
                : [],
            decisionReviewIds.length
                ? this.prisma.delegated_action_logs.findMany({
                    where: {
                        actor_user_id: user.userId,
                        action_code: WORK_ITEM_ACTIONS.TECHNICAL_REVIEW,
                        technical_review_id: { in: decisionReviewIds },
                    },
                    select: { technical_review_id: true },
                })
                : [],
            decisionPlanIds.length
                ? this.prisma.audit_team_members.findMany({
                    where: {
                        audit_team_appointments: { audit_plan_id: { in: decisionPlanIds } },
                        experts: { user_id: user.userId },
                        assignment_status: { not: 'cancelled' },
                    },
                    select: { audit_team_appointments: { select: { audit_plan_id: true } } },
                })
                : [],
        ]);
        const reviewedConflictIds = new Set([
            ...ownReviews.map((review) => review.id),
            ...delegatedReviews.map((log) => log.technical_review_id).filter((id): id is string => Boolean(id)),
        ]);
        const auditedConflictPlanIds = new Set(
            auditMemberships.map((membership) => membership.audit_team_appointments.audit_plan_id),
        );

        const safeItems =
            await Promise.all(
                scopedItems.map(
                    async (item) => {
                        const effectiveDelegation =
                            activeDelegations.find((delegation) =>
                                item.assigned_user_id === delegation.delegatorUserId &&
                                delegation.actions.includes(item.action_code) &&
                                (!delegation.projectId || delegation.projectId === item.project_id),
                            ) ?? null;
                        const sla =
                            evaluateWorkItemSla(
                                item,
                                now,
                                getWorkItemSlaPolicy(
                                    item.action_code,
                                ),
                            );
                        const sodConflict =
                            item.action_code === WORK_ITEM_ACTIONS.CERTIFICATION_DECISION &&
                            (
                                reviewedConflictIds.has(item.entity_id) ||
                                Boolean(item.audit_plan_id && auditedConflictPlanIds.has(item.audit_plan_id))
                            );

                        return {
                        id:
                            item.id,
                        source_key:
                            item.source_key,
                        work_type:
                            item.work_type,
                        action_code:
                            item.action_code,
                        title:
                            item.title,
                        description:
                            item.description,
                        entity_type:
                            item.entity_type,
                        entity_id:
                            item.entity_id,
                        project_id:
                            item.project_id,
                        project_code:
                            item.project
                                ?.project_code ??
                            null,
                        organization_name:
                            item.project
                                ?.certification_applications
                                .customers
                                .company_name ??
                            null,
                        audit_event_id:
                            item.audit_event_id,
                        audit_plan_id:
                            item.audit_plan_id,
                        cycle_key:
                            item.cycle_key,
                        assigned_user_id:
                            item.assigned_user_id,
                        assigned_role:
                            item.assigned_role,
                        assignee:
                            item.assigned_user
                                ?.full_name ??
                            item.assigned_user
                                ?.username ??
                            item.assigned_role,
                        is_delegated:
                            Boolean(effectiveDelegation),
                        delegated_from_user:
                            effectiveDelegation?.delegatedFromUser ?? null,
                        delegation_validity:
                            effectiveDelegation
                                ? {
                                    effective_from: effectiveDelegation.effectiveFrom,
                                    effective_to: effectiveDelegation.effectiveTo,
                                }
                                : null,
                        status:
                            item.status,
                        priority:
                            item.priority,
                        due_at:
                            item.due_at,
                        is_overdue:
                            Boolean(
                                item.due_at &&
                                item.due_at < now &&
                                ![
                                    'DONE',
                                    'CANCELLED',
                                ].includes(
                                    item.status,
                                ),
                            ),
                        sla_state:
                            sla.state,
                        sla_label:
                            sla.label,
                        days_until_due:
                            sla.daysUntilDue,
                        days_overdue:
                            sla.daysOverdue,
                        escalation_level:
                            sla.escalationLevel,
                        destination_path:
                            item.destination_path,
                        context:
                            this.parseContext(
                                item.context_json,
                            ),
                        can_view:
                            true,
                        can_execute:
                            !sodConflict && this.authorization
                                .canPerformActionWithinScope({
                                    user,
                                    actionCode:
                                        item.action_code,
                                    resource: {
                                        projectId:
                                            item.project_id,
                                        entityType:
                                            item.entity_type,
                                        entityId:
                                            item.entity_id,
                                    },
                                    assignment: {
                                        assignedUserId:
                                            item.assigned_user_id,
                                        assignedRole:
                                            item.assigned_role,
                                    },
                                    workflowState:
                                        item.status,
                                    effectiveDelegation:
                                        effectiveDelegation
                                            ? {
                                                id: effectiveDelegation.id,
                                                delegatorUserId: effectiveDelegation.delegatorUserId,
                                            }
                                            : null,
                                }),
                        available_at:
                            item.available_at,
                        completed_at:
                            item.completed_at,
                        cancelled_at:
                            item.cancelled_at,
                        created_at:
                            item.created_at,
                        updated_at:
                            item.updated_at,
                        };
                    },
                ),
            );

        const priorityWeight:
            Record<string, number> = {
            URGENT:
                0,
            HIGH:
                1,
            NORMAL:
                2,
            LOW:
                3,
        };

        safeItems.sort((left, right) => {
            if (status === 'DONE') {
                return (
                    right.completed_at?.getTime() ??
                    right.updated_at.getTime()
                ) - (
                    left.completed_at?.getTime() ??
                    left.updated_at.getTime()
                );
            }

            const overdueDifference =
                Number(right.is_overdue) -
                Number(left.is_overdue);

            if (overdueDifference !== 0) {
                return overdueDifference;
            }

            const priorityDifference =
                (priorityWeight[left.priority] ?? 4) -
                (priorityWeight[right.priority] ?? 4);

            if (priorityDifference !== 0) {
                return priorityDifference;
            }

            return (
                left.due_at?.getTime() ??
                Number.MAX_SAFE_INTEGER
            ) - (
                right.due_at?.getTime() ??
                Number.MAX_SAFE_INTEGER
            );
        });

        const matchingItems = search
            ? safeItems.filter((item) => [
                item.title,
                item.description,
                item.project_code,
                item.organization_name,
                item.assignee,
                item.work_type,
                item.status,
            ].filter(Boolean).join(' ').toLocaleLowerCase('vi').includes(search))
            : safeItems;
        const total = matchingItems.length;
        const pageCount = Math.ceil(total / limit);

        return {
            generated_at:
                now,
            pagination: {
                page,
                page_size: limit,
                total,
                page_count: pageCount,
                has_more: page < pageCount,
            },
            summary: {
                open:
                    safeItems.filter(
                        (item) =>
                            item.status ===
                            'OPEN',
                    ).length,
                in_progress:
                    safeItems.filter(
                        (item) =>
                            item.status ===
                            'IN_PROGRESS',
                    ).length,
                total:
                    safeItems.length,
                overdue:
                    safeItems.filter(
                        (item) =>
                            item.is_overdue,
                    ).length,
                due_soon:
                    safeItems.filter(
                        (item) =>
                            item.due_at &&
                            item.due_at >= now &&
                            item.due_at <= dueSoon,
                    ).length,
                high_priority:
                    safeItems.filter(
                        (item) =>
                            [
                                'HIGH',
                                'URGENT',
                            ].includes(
                                item.priority,
                            ),
                    ).length,
            },
            filter: {
                status:
                    status ??
                    'ACTIVE',
                priority:
                    priority ??
                    null,
                work_type:
                    workType ??
                    null,
                due:
                    dueFilter ??
                    null,
                limit,
                page,
                search: rawSearch,
            },
            items: matchingItems.slice((page - 1) * limit, page * limit),
        };
    }

    private async authorizationProjectScope(
        projectIds: string[],
        user: {
            userId: string;
            roles: string[];
        },
    ) {
        if (projectIds.length === 0) {
            return [];
        }

        return this.resourceAccess
            .filterProjectIds(
                projectIds,
                user,
            );
    }

    async reconcile(
        apply = false,
    ) {
        const [
            pendingReviews,
            pendingDecisions,
            pendingCertificates,
            capFindings,
            applicationReviews,
            surveillanceSnapshots,
            operationalPlanRows,
            readyReports,
        ] = await Promise.all([
            this.prisma.technical_reviews.findMany({
                where: {
                    status: {
                        notIn: [
                            'completed',
                            'accepted',
                        ],
                    },
                },
                select: {
                    id: true,
                    reviewer_id: true,
                    status: true,
                    report_id: true,
                    assignments: {
                        where: { status: 'CURRENT' },
                        take: 1,
                        select: { id: true, due_at: true },
                    },
                    reports: {
                        select: {
                            report_code:
                                true,
                            audit_plan_id:
                                true,
                            audit_plans: {
                                select: {
                                    project_id:
                                        true,
                                    audit_event_id:
                                        true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.technical_reviews.findMany({
                where: {
                    status:
                        'completed',
                    certification_decision:
                        null,
                },
                select: {
                    id: true,
                    report_id: true,
                    reports: {
                        select: {
                            report_code:
                                true,
                            audit_plan_id:
                                true,
                            audit_plans: {
                                select: {
                                    project_id:
                                        true,
                                    audit_event_id:
                                        true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.certification_decisions.findMany({
                where: {
                    decision_result:
                        'approved',
                    decision_type: {
                        in:
                            Array.from(
                                CERTIFICATE_VERSION_DECISIONS,
                            ),
                    },
                    certificates: {
                        none: {},
                    },
                },
                select: {
                    id: true,
                    status: true,
                    project_id: true,
                    technical_review_id:
                        true,
                    decision_number:
                        true,
                    decision_type:
                        true,
                    technical_reviews: {
                        select: {
                            report_id:
                                true,
                            reports: {
                                select: {
                                    audit_plan_id:
                                        true,
                                    audit_plans: {
                                        select: {
                                            audit_event_id:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.audit_findings.findMany({
                where: {
                    finding_type: {
                        in: [
                            'major_nc',
                            'minor_nc',
                        ],
                    },
                    status: {
                        in: [
                            'open',
                            'revision_required',
                            'response_submitted',
                        ],
                    },
                },
                select: {
                    id: true,
                    finding_code: true,
                    status: true,
                    due_date: true,
                    reports: {
                        select: {
                            audit_plan_id:
                                true,
                            audit_plans: {
                                select: {
                                    project_id:
                                        true,
                                    audit_event_id:
                                        true,
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.application_reviews.findMany({
                where: {
                    workflow_status:
                        'SUBMITTED',
                    reviewer_id: {
                        not:
                            null,
                    },
                },
                select: {
                    id: true,
                    reviewer_id: true,
                    submitted_at: true,
                    certification_applications: {
                        select: {
                            id: true,
                            application_code:
                                true,
                        },
                    },
                },
            }),
            this.prisma.surveillance_information_snapshots.findMany({
                where: {
                    status:
                        'CONFIRMED',
                },
                select: {
                    id: true,
                    status: true,
                    project_id: true,
                    audit_event_id: true,
                    change_impact: true,
                    changes_json: true,
                    audit_event: {
                        select: {
                            event_type: true,
                            planned_start_date:
                                true,
                        },
                    },
                },
            }),
            this.prisma.audit_plans.findMany({
                where: {
                    audit_type: {
                        not:
                            'project_team',
                    },
                    status: {
                        notIn: [
                            'completed',
                            'cancelled',
                            'retired',
                            'superseded',
                        ],
                    },
                },
                include: {
                    audit_team_appointment: {
                        include: {
                            members: {
                                include: {
                                    experts: {
                                        select: {
                                            user_id:
                                                true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            this.prisma.reports.findMany({
                where: {
                    status: 'ready_for_technical_review',
                    technical_reviews: { none: {} },
                    audit_findings: {
                        none: {
                            finding_type: { in: ['major_nc', 'minor_nc'] },
                            status: { not: 'closed' },
                        },
                    },
                },
                select: {
                    id: true,
                    report_code: true,
                    audit_plan_id: true,
                    audit_plans: {
                        select: {
                            id: true,
                            project_id: true,
                            audit_event_id: true,
                        },
                    },
                },
            }),
        ]);

        const operationalPlans =
            resolveCanonicalOperationalPlans(
                operationalPlanRows,
            ).plans;

        const candidates:
            OpenWorkItemInput[] = [
            ...applicationReviews.map((review) => ({
                sourceKey:
                    `application-review:${review.id}:${review.submitted_at?.getTime() ?? 0}`,
                workType:
                    'APPLICATION_REVIEW' as const,
                actionCode:
                    WORK_ITEM_ACTIONS.APPLICATION_REVIEW,
                title:
                    `Xem xét đơn ${review.certification_applications.application_code}`,
                entityType:
                    'application_review',
                entityId:
                    review.id,
                assignedUserId:
                    review.reviewer_id!,
                priority:
                    'HIGH' as const,
                destinationPath:
                    `/applications/${review.certification_applications.id}?workspace=application-review&review_id=${review.id}`,
                context: {
                    application_id:
                        review.certification_applications.id,
                    application_code:
                        review.certification_applications.application_code,
                },
            })),
            ...surveillanceSnapshots
                .filter((snapshot) => {
                    let changes:
                        Array<Record<string, unknown>> = [];
                    try {
                        changes =
                            JSON.parse(
                                snapshot.changes_json,
                            );
                    } catch {
                        changes = [];
                    }

                    return hasSignificantSurveillanceChange({
                        status:
                            snapshot.status,
                        change_impact:
                            snapshot.change_impact,
                        changes,
                    });
                })
                .map((snapshot) => ({
                    sourceKey:
                        `surveillance-change-review:${snapshot.id}`,
                    workType:
                        'SURVEILLANCE_CHANGE_REVIEW' as const,
                    actionCode:
                        WORK_ITEM_ACTIONS.SURVEILLANCE_CHANGE_REVIEW,
                    title:
                        'Rà soát thay đổi trước đánh giá giám sát',
                    entityType:
                        'surveillance_information_snapshot',
                    entityId:
                        snapshot.id,
                    projectId:
                        snapshot.project_id,
                    auditEventId:
                        snapshot.audit_event_id,
                    cycleKey:
                        snapshot.audit_event.event_type,
                    assignedRole:
                        'COORDINATOR',
                    priority:
                        'HIGH' as const,
                    dueAt:
                        snapshot.audit_event.planned_start_date,
                    destinationPath:
                        `/projects/${snapshot.project_id}?workspace=surveillance-change&audit_event_id=${snapshot.audit_event_id}`,
                    context: {
                        snapshot_id:
                            snapshot.id,
                        change_impact:
                            snapshot.change_impact,
                    },
                })),
            ...operationalPlans.map((plan) => {
                const appointment =
                    plan.audit_team_appointment;
                const appointmentIssued =
                    [
                        'issued',
                        'confirmed',
                    ].includes(
                        appointment?.status
                            ?.trim()
                            .toLowerCase() ??
                        '',
                    );

                if (!appointmentIssued) {
                    return {
                        sourceKey:
                            `audit-team-issue:${plan.id}`,
                        workType:
                            'F04_TEAM_APPOINTMENT' as const,
                        actionCode:
                            WORK_ITEM_ACTIONS.AUDIT_TEAM_ISSUE,
                        title:
                            `Bổ nhiệm đoàn đánh giá ${plan.plan_code ?? ''}`.trim(),
                        entityType:
                            'audit_plan',
                        entityId:
                            plan.id,
                        projectId:
                            plan.project_id,
                        auditEventId:
                            plan.audit_event_id,
                        auditPlanId:
                            plan.id,
                        cycleKey:
                            plan.audit_type,
                        assignedRole:
                            'COORDINATOR',
                        priority:
                            'HIGH' as const,
                        dueAt:
                            plan.planned_start_date,
                        destinationPath:
                            `/projects/${plan.project_id}?workspace=audit-team&audit_plan_id=${plan.id}`,
                        context: {
                            plan_code:
                                plan.plan_code,
                            audit_type:
                                plan.audit_type,
                        },
                    };
                }

                const lead =
                    appointment?.members.find((member) =>
                        [
                            'TEAM_LEADER',
                            'LEAD_AUDITOR',
                        ].includes(
                            member.team_role
                                .trim()
                                .toUpperCase(),
                        ),
                    );
                const prepared =
                    hasPreparedAuditPlan(
                        plan.form_data,
                    );

                return {
                    sourceKey:
                        prepared
                            ? `audit-execution:${plan.id}`
                            : `audit-plan:${plan.id}`,
                    workType:
                        prepared
                            ? 'AUDIT_EXECUTION' as const
                            : 'AUDIT_PLAN' as const,
                    actionCode:
                        prepared
                            ? WORK_ITEM_ACTIONS.AUDIT_EXECUTE
                            : WORK_ITEM_ACTIONS.AUDIT_PLAN_PREPARE,
                    title:
                        `${prepared ? 'Thực hiện' : 'Chuẩn bị kế hoạch'} đánh giá ${plan.plan_code ?? ''}`.trim(),
                    entityType:
                        'audit_plan',
                    entityId:
                        plan.id,
                    projectId:
                        plan.project_id,
                    auditEventId:
                        plan.audit_event_id,
                    auditPlanId:
                        plan.id,
                    cycleKey:
                        plan.audit_type,
                    assignedUserId:
                        lead?.experts.user_id ??
                        null,
                    assignedRole:
                        lead?.experts.user_id
                            ? null
                            : 'LEAD_AUDITOR',
                    dueAt:
                        plan.planned_start_date,
                    destinationPath:
                        `/projects/${plan.project_id}?workspace=${prepared ? 'audit-execution' : 'audit-plan'}&audit_plan_id=${plan.id}`,
                    context: {
                        plan_code:
                            plan.plan_code,
                        audit_type:
                            plan.audit_type,
                        appointment_id:
                            appointment?.id ??
                            null,
                    },
                };
            }),
            ...readyReports.map((report) => ({
                sourceKey: `technical-review-assignment:${report.id}`,
                workType: 'REVIEWER_ASSIGNMENT' as const,
                actionCode: WORK_ITEM_ACTIONS.TECHNICAL_REVIEW_ASSIGN,
                title: `Phân công người thẩm xét ${report.report_code}`,
                entityType: 'report',
                entityId: report.id,
                projectId: report.audit_plans.project_id,
                auditEventId: report.audit_plans.audit_event_id,
                auditPlanId: report.audit_plan_id,
                assignedRole: 'COORDINATOR',
                priority: 'HIGH' as const,
                destinationPath: `/projects/${report.audit_plans.project_id}?workspace=technical-review&audit_plan_id=${report.audit_plan_id}`,
                context: {
                    report_id: report.id,
                    report_code: report.report_code,
                    assignment_state: 'UNASSIGNED',
                },
            })),
            ...pendingReviews.map((review) => ({
                sourceKey:
                    `technical-review:${review.id}:${review.assignments[0]?.id ?? 'legacy'}`,
                workType:
                    'TECHNICAL_REVIEW' as const,
                actionCode:
                    WORK_ITEM_ACTIONS.TECHNICAL_REVIEW,
                title:
                    `Thẩm xét kỹ thuật ${review.reports.report_code}`,
                entityType:
                    'technical_review',
                entityId:
                    review.id,
                projectId:
                    review.reports.audit_plans.project_id,
                auditEventId:
                    review.reports.audit_plans.audit_event_id,
                auditPlanId:
                    review.reports.audit_plan_id,
                assignedUserId:
                    review.reviewer_id,
                dueAt:
                    review.assignments[0]?.due_at ?? null,
                priority:
                    review.status === 'revision_required'
                        ? 'HIGH' as const
                        : 'NORMAL' as const,
                destinationPath:
                    `/projects/${review.reports.audit_plans.project_id}?workspace=technical-review&technical_review_id=${review.id}&audit_plan_id=${review.reports.audit_plan_id}`,
                context: {
                    report_id:
                        review.report_id,
                    report_code:
                        review.reports.report_code,
                },
            })),
            ...pendingDecisions.map((review) => ({
                sourceKey:
                    `certification-decision:${review.id}`,
                workType:
                    'CERTIFICATION_DECISION' as const,
                actionCode:
                    WORK_ITEM_ACTIONS.CERTIFICATION_DECISION,
                title:
                    `Ra quyết định chứng nhận ${review.reports.report_code}`,
                entityType:
                    'technical_review',
                entityId:
                    review.id,
                projectId:
                    review.reports.audit_plans.project_id,
                auditEventId:
                    review.reports.audit_plans.audit_event_id,
                auditPlanId:
                    review.reports.audit_plan_id,
                assignedRole:
                    'DECISION_MAKER',
                priority:
                    'HIGH' as const,
                destinationPath:
                    `/projects/${review.reports.audit_plans.project_id}?workspace=certification-decision&technical_review_id=${review.id}&audit_plan_id=${review.reports.audit_plan_id}`,
                context: {
                    report_id:
                        review.report_id,
                    report_code:
                        review.reports.report_code,
                },
            })),
            ...pendingCertificates.map((decision) => ({
                sourceKey:
                    `certificate-issue:${decision.id}`,
                workType:
                    'CERTIFICATE_ISSUE' as const,
                actionCode:
                    WORK_ITEM_ACTIONS.CERTIFICATE_ISSUE,
                title:
                    `Phát hành chứng chỉ theo ${decision.decision_number}`,
                entityType:
                    'certification_decision',
                entityId:
                    decision.id,
                projectId:
                    decision.project_id,
                auditEventId:
                    decision.technical_reviews.reports.audit_plans.audit_event_id,
                auditPlanId:
                    decision.technical_reviews.reports.audit_plan_id,
                assignedRole:
                    'DECISION_MAKER',
                priority:
                    'HIGH' as const,
                destinationPath:
                    `/projects/${decision.project_id}?workspace=certificate-issue&decision_id=${decision.id}&audit_plan_id=${decision.technical_reviews.reports.audit_plan_id}`,
                context: {
                    technical_review_id:
                        decision.technical_review_id,
                    decision_number:
                        decision.decision_number,
                    decision_type:
                        decision.decision_type,
                },
            })),
            ...capFindings.map((finding) => {
                const awaitsReview =
                    finding.status ===
                    'response_submitted';
                const actionCode =
                    awaitsReview
                        ? WORK_ITEM_ACTIONS.CAP_REVIEW
                        : WORK_ITEM_ACTIONS.CAP_RESPOND;

                return {
                    sourceKey:
                        `cap:${finding.id}:${actionCode}`,
                    workType:
                        'CAP_ACTION_OR_REVIEW' as const,
                    actionCode,
                    title:
                        awaitsReview
                            ? `Xem xét CAP ${finding.finding_code}`
                            : `Phản hồi CAP ${finding.finding_code}`,
                    entityType:
                        'audit_finding',
                    entityId:
                        finding.id,
                    projectId:
                        finding.reports.audit_plans.project_id,
                    auditEventId:
                        finding.reports.audit_plans.audit_event_id,
                    auditPlanId:
                        finding.reports.audit_plan_id,
                    assignedRole:
                        awaitsReview
                            ? 'LEAD_AUDITOR'
                            : 'CUSTOMER',
                    priority:
                        'HIGH' as const,
                    dueAt:
                        finding.due_date,
                    destinationPath:
                        `/projects/${finding.reports.audit_plans.project_id}?workspace=cap&finding_id=${finding.id}&audit_plan_id=${finding.reports.audit_plan_id}`,
                    context: {
                        finding_code:
                            finding.finding_code,
                        finding_status:
                            finding.status,
                    },
                };
            }),
        ];

        if (!apply) {
            return {
                mode:
                    'dry-run',
                candidate_count:
                    candidates.length,
                source_keys:
                    candidates.map((item) =>
                        item.sourceKey,
                    ),
            };
        }

        const results:
            Array<{
                source_key: string;
            }> = [];
        for (const candidate of candidates) {
            results.push(
                await this.openWorkItem(
                    candidate,
                ),
            );
        }

        return {
            mode:
                'apply',
            candidate_count:
                candidates.length,
            persisted_count:
                results.length,
            source_keys:
                results.map((item) =>
                    item.source_key,
                ),
        };
    }

    async getById(
        id: string,
    ) {
        const item =
            await this.prisma.work_items.findUnique({
                where: {
                    id,
                },
            });

        if (!item) {
            throw new NotFoundException(
                'Không tìm thấy work item',
            );
        }

        return item;
    }
}

import {
    Optional,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

import {
    ResourceAccessService,
    type ResourceActor,
} from '../security/resource-access.service';
import {
    normalizeRoles,
} from '../security/security-request';
import {
    ACTION_ELIGIBLE_ROLES,
    WORK_ITEM_ACTIONS,
} from './work-item.constants';
import { PrismaService } from '../prisma/prisma.service';

export interface ActionResource {
    projectId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
}

export interface ActionAssignment {
    assignedUserId?: string | null;
    assignedRole?: string | null;
}

export interface ActionAuthorizationInput {
    user: ResourceActor;
    actionCode?: string | null;
    resource?: ActionResource | null;
    assignment?: ActionAssignment | null;
    workflowState?: string | null;
    effectiveDelegation?: {
        id: string;
        delegatorUserId: string;
    } | null;
}

const ACTION_ROLES =
    ACTION_ELIGIBLE_ROLES;

const ACTION_STATES =
    new Map<string, Set<string>>(
        Array.from(
            ACTION_ROLES.keys(),
        ).map((actionCode) => [
            actionCode,
            new Set([
                'OPEN',
                'IN_PROGRESS',
                'SUBMITTED',
                'RESUBMITTED',
                'CONFIRMED',
                'REVIEWABLE',
                'PENDING',
                'READY',
                'COMPLETED',
                'APPROVED',
                'ISSUED',
                'RESPONSE_SUBMITTED',
                'CORRECTIVE_ACTION_REQUIRED',
            ]),
        ]),
    );

@Injectable()
export class ActionAuthorizationService {
    constructor(
        private readonly resourceAccess:
            ResourceAccessService,
        @Optional()
        private readonly prisma?:
            PrismaService,
    ) { }

    canPerformActionWithinScope(
        input: ActionAuthorizationInput,
    ) {
        const actionCode =
            input.actionCode
                ?.trim()
                .toLowerCase();
        const workflowState =
            input.workflowState
                ?.trim()
                .toUpperCase();
        const roles =
            normalizeRoles(
                input.user.roles,
            );

        if (
            !actionCode ||
            !workflowState ||
            !input.resource ||
            (
                !input.resource.projectId &&
                (
                    !input.resource.entityType ||
                    !input.resource.entityId
                )
            ) ||
            !ACTION_ROLES.has(actionCode) ||
            !ACTION_STATES
                .get(actionCode)
                ?.has(workflowState)
        ) {
            return false;
        }

        const assignment =
            input.assignment;

        if (
            !assignment ||
            (
                !assignment.assignedUserId &&
                !assignment.assignedRole
            )
        ) {
            return false;
        }

        const allowedRoles =
            ACTION_ROLES.get(
                actionCode,
            )!;

        if (
            !roles.some((role) =>
                allowedRoles.has(role),
            )
        ) {
            return false;
        }

        const assignedToUser =
            Boolean(
                assignment.assignedUserId &&
                input.user.userId &&
                assignment.assignedUserId ===
                    input.user.userId,
            );
        const assignedToRole =
            Boolean(
                assignment.assignedRole &&
                roles.includes(
                    assignment.assignedRole
                        .trim()
                        .toUpperCase(),
                ),
            );
        const assignedThroughDelegation =
            Boolean(
                input.effectiveDelegation &&
                assignment.assignedUserId ===
                    input.effectiveDelegation
                        .delegatorUserId,
            );

        if (
            !assignedToUser &&
            !assignedToRole &&
            !assignedThroughDelegation
        ) {
            return false;
        }

        return true;
    }

    async canPerformAction(
        input: ActionAuthorizationInput,
    ) {
        let resolvedInput =
            input;

        if (
            !this.canPerformActionWithinScope(input) &&
            this.prisma &&
            input.user.userId &&
            input.assignment?.assignedUserId &&
            input.assignment.assignedUserId !== input.user.userId &&
            input.actionCode
        ) {
            const now = new Date();
            const actionCode = input.actionCode.trim().toLowerCase();
            const candidates =
                await this.prisma.delegations.findMany({
                    where: {
                        delegate_user_id:
                            input.user.userId,
                        delegator_user_id:
                            input.assignment.assignedUserId,
                        status: {
                            in: ['SCHEDULED', 'ACTIVE'],
                        },
                        effective_from: { lte: now },
                        effective_to: { gt: now },
                        OR: [
                            { project_id: null },
                            { project_id: input.resource?.projectId ?? undefined },
                        ],
                    },
                });
            const delegation = candidates.find((candidate) => {
                try {
                    const actions = JSON.parse(candidate.action_codes_json);
                    return Array.isArray(actions) &&
                        actions.map((value) => String(value).toLowerCase())
                            .includes(actionCode);
                } catch {
                    return false;
                }
            });

            if (delegation) {
                resolvedInput = {
                    ...input,
                    effectiveDelegation: {
                        id: delegation.id,
                        delegatorUserId: delegation.delegator_user_id,
                    },
                };
            }
        }

        if (
            !this.canPerformActionWithinScope(
                resolvedInput,
            )
        ) {
            return false;
        }

        const resource =
            input.resource!;

        const actionCode =
            resolvedInput.actionCode
                ?.trim()
                .toLowerCase();
        const entityType =
            resource.entityType
                ?.trim()
                .toLowerCase()
                .replace(/-/g, '_');

        // Application review happens before a certification project exists.
        // For this one pre-project action, the explicit reviewer assignment is
        // the resource boundary. Re-check it from the database instead of
        // forcing project-scoped access that cannot exist yet.
        if (
            actionCode === WORK_ITEM_ACTIONS.APPLICATION_REVIEW &&
            ['application_review', 'application_reviews'].includes(
                entityType ?? '',
            )
        ) {
            if (
                !this.prisma ||
                !resource.entityId ||
                !resolvedInput.user.userId
            ) {
                return false;
            }

            const expectedReviewerId = resolvedInput.effectiveDelegation
                ? resolvedInput.effectiveDelegation.delegatorUserId
                : resolvedInput.user.userId;

            if (
                resolvedInput.assignment?.assignedUserId !== expectedReviewerId
            ) {
                return false;
            }

            const review =
                await this.prisma.application_reviews.findUnique({
                    where: {
                        id: resource.entityId,
                    },
                    select: {
                        reviewer_id: true,
                        workflow_status: true,
                    },
                });

            return Boolean(
                review &&
                review.reviewer_id === expectedReviewerId &&
                review.workflow_status
                    ?.trim()
                    .toUpperCase() ===
                resolvedInput.workflowState
                    ?.trim()
                    .toUpperCase(),
            );
        }

        if (resource.projectId) {
            const scopedProjectIds =
                await this.resourceAccess
                    .filterProjectIds(
                        [
                            resource
                                .projectId,
                        ],
                        input.user,
                    );

            return scopedProjectIds.length === 1;
        }

        const scopedEntities =
            await this.resourceAccess
                .filterEntities(
                    [{
                        entity_type:
                            resource.entityType!,
                        entity_id:
                            resource.entityId!,
                    }],
                input.user,
                );

        return scopedEntities.length === 1;
    }

    async assertCanPerformAction(
        input: ActionAuthorizationInput,
    ) {
        if (
            !await this.canPerformAction(
                input,
            )
        ) {
            throw new ForbiddenException(
                'Bạn không được phép thực hiện hành động này trong hồ sơ hiện tại',
            );
        }
    }
}

import type {
    Request,
} from 'express';

export interface AuthenticatedActor {
    userId?: string;
    username?: string | null;
    email?: string | null;
    roles?: string[];
    permissions?: string[];
}

export interface SecurityRequest
    extends Request {
    requestId?: string;
    user?: AuthenticatedActor & {
        id?: string;
        sub?: string;
    };
}

export function getActorUserId(
    request: SecurityRequest,
) {
    return request.user?.userId ??
        request.user?.id ??
        request.user?.sub ??
        null;
}

export function normalizeRoles(
    roles?: string[],
) {
    return (
        roles ?? []
    ).map((role) =>
        role
            .trim()
            .toUpperCase(),
    );
}

export function getResourceActor(
    request: SecurityRequest,
) {
    return {
        userId:
            getActorUserId(
                request,
            ),
        roles:
            request.user?.roles ??
            [],
    };
}

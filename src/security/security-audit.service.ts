import {
    Injectable,
    Logger,
} from '@nestjs/common';

import {
    PrismaService,
} from '../prisma/prisma.service';

export interface SecurityAuditInput {
    userId?: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    outcome: 'success' | 'failure' | 'blocked';
    statusCode?: number | null;
    durationMs?: number | null;
    details?: Record<string, unknown> | null;
}

@Injectable()
export class SecurityAuditService {
    private readonly logger =
        new Logger(
            SecurityAuditService.name,
        );

    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    async write(
        input: SecurityAuditInput,
    ) {
        try {
            await this.prisma.audit_logs.create({
                data: {
                    user_id:
                        input.userId ?? null,
                    action:
                        input.action
                            .trim()
                            .slice(0, 100),
                    entity_type:
                        input.entityType
                            ?.trim()
                            .slice(0, 50) ??
                        null,
                    entity_id:
                        input.entityId ?? null,
                    ip_address:
                        input.ipAddress
                            ?.trim()
                            .slice(0, 50) ??
                        null,
                    user_agent:
                        input.userAgent
                            ?.trim()
                            .slice(0, 255) ??
                        null,
                    request_id:
                        input.requestId
                            ?.trim()
                            .slice(0, 100) ??
                        null,
                    outcome:
                        input.outcome,
                    status_code:
                        input.statusCode ?? null,
                    duration_ms:
                        input.durationMs ?? null,
                    details_json:
                        input.details
                            ? JSON.stringify(input.details)
                            : null,
                },
            });
        } catch (error) {
            // Audit log không được làm hỏng nghiệp vụ chính, nhưng phải để lại
            // dấu vết trong server log để quản trị viên biết audit DB đang lỗi.
            this.logger.error(
                'Không thể ghi security audit log',
                error instanceof Error
                    ? error.stack
                    : undefined,
            );
        }
    }
}

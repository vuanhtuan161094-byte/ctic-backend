import { Injectable } from '@nestjs/common';
import { getReleaseMetadata } from '../common/release-metadata';
import { assertStorageWritable, getStorageConfig } from '../common/storage-config';
import { NotificationSchedulerService } from '../notifications/notification-scheduler.service';
import { DatabaseSchemaService } from '../prisma/database-schema.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemAdministrationPageQueryDto } from './dto/system-administration-query.dto';

@Injectable()
export class SystemAdministrationService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly databaseSchema: DatabaseSchemaService,
        private readonly scheduler: NotificationSchedulerService,
    ) {}

    private page(query: SystemAdministrationPageQueryDto) {
        const page = query.page || 1;
        const limit = query.limit || 25;
        return { page, limit, skip: (page - 1) * limit };
    }

    async getOverview() {
        const now = new Date();
        const [
            totalUsers,
            activeUsers,
            inactiveUsers,
            lockedUsers,
            internalUsers,
            customerUsers,
            usersWithoutAccess,
            roles,
            activeCustomerAccess,
            pendingAccessRequests,
            revokedCustomerAccess,
            activeExpertsWithoutAccount,
            activeExpertsWithInactiveAccount,
            suspendedExperts,
            organization,
            overdueNotifications,
            securityEvents,
        ] = await Promise.all([
            this.prisma.users.count(),
            this.prisma.users.count({ where: { status: 'active', OR: [{ locked_until: null }, { locked_until: { lte: now } }] } }),
            this.prisma.users.count({ where: { status: { not: 'active' } } }),
            this.prisma.users.count({ where: { locked_until: { gt: now } } }),
            this.prisma.users.count({ where: { user_roles: { some: { roles: { role_name: { not: 'customer' } } } } } }),
            this.prisma.users.count({ where: { customer_access: { some: { status: 'active' } } } }),
            this.prisma.users.count({ where: { user_roles: { none: {} }, customer_access: { none: { status: 'active' } } } }),
            this.prisma.roles.findMany({
                orderBy: { role_name: 'asc' },
                select: { role_name: true, _count: { select: { user_roles: true } } },
            }),
            this.prisma.customer_user_access.count({ where: { status: 'active' } }),
            this.prisma.customer_user_access_requests.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
            this.prisma.customer_user_access.count({ where: { status: { not: 'active' } } }),
            this.prisma.experts.count({ where: { status: 'active', user_id: null } }),
            this.prisma.experts.count({ where: { status: 'active', user_account: { is: { status: { not: 'active' } } } } }),
            this.prisma.experts.count({ where: { OR: [{ status: { not: 'active' } }, { profile_status: { in: ['SUSPENDED', 'DEACTIVATED'] } }] } }),
            this.prisma.organization_profiles.findUnique({
                where: { profile_key: 'PRIMARY' },
                select: { legal_name: true, display_name: true, short_name: true, timezone: true, locale: true, file_retention_days: true, updated_at: true },
            }),
            this.prisma.notifications.count({ where: { due_date: { lt: now }, status: 'unread' } }),
            this.prisma.audit_logs.count({ where: { OR: [{ outcome: { in: ['failure', 'blocked'] } }, { status_code: { in: [401, 403, 429] } }] } }),
        ]);

        return {
            generated_at: now,
            deployment_model: 'SINGLE_CERTIFICATION_BODY_INSTALLATION',
            users: {
                total: totalUsers,
                active: activeUsers,
                inactive: inactiveUsers,
                locked: lockedUsers,
                internal: internalUsers,
                customer: customerUsers,
                without_active_role_or_access: usersWithoutAccess,
                last_login_available: false,
                by_role: roles.map((role) => ({ role: role.role_name, users: role._count.user_roles })),
            },
            customer_access: { active: activeCustomerAccess, pending_requests: pendingAccessRequests, revoked: revokedCustomerAccess, mutation_authority: 'CONTROLLED_DIRECT_OR_REQUEST_WORKFLOW' },
            experts: { active_without_account: activeExpertsWithoutAccount, active_with_inactive_account: activeExpertsWithInactiveAccount, suspended_or_deactivated: suspendedExperts, automatic_activation: false },
            security: { failed_or_blocked_events: securityEvents, arbitrary_role_designer: false, arbitrary_permission_designer: false },
            notifications: { overdue_unread: overdueNotifications },
            organization,
            invariants: [
                { key: 'customer_isolation', status: 'CODE_GOVERNED' },
                { key: 'segregation_of_duties', status: 'CODE_GOVERNED' },
                { key: 'issued_document_immutability', status: 'CODE_GOVERNED' },
                { key: 'certificate_lifecycle', status: 'CODE_GOVERNED' },
                { key: 'customer_access_authority', status: 'CONTROLLED_DIRECT_OR_REQUEST_WORKFLOW' },
            ],
            scheduler: this.scheduler.getStatus(),
        };
    }

    async getCustomerAccess(query: SystemAdministrationPageQueryDto) {
        const { page, limit, skip } = this.page(query);
        const [total, items, pending, recentHistory] = await Promise.all([
            this.prisma.customer_user_access.count(),
            this.prisma.customer_user_access.findMany({
                skip, take: limit, orderBy: { updated_at: 'desc' },
                select: {
                    id: true, status: true, created_at: true, updated_at: true,
                    customer: { select: { id: true, customer_code: true, company_name: true } },
                    user: { select: { id: true, username: true, email: true, full_name: true, status: true } },
                },
            }),
            this.prisma.customer_user_access_requests.findMany({
                where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } }, take: 25, orderBy: { created_at: 'desc' },
                select: { id: true, request_code: true, request_type: true, status: true, requested_email: true, submitted_at: true, customer: { select: { customer_code: true, company_name: true } } },
            }),
            this.prisma.customer_user_access_history.findMany({
                take: 25, orderBy: { changed_at: 'desc' },
                select: { id: true, action: true, source_type: true, changed_at: true, customer: { select: { customer_code: true, company_name: true } }, user: { select: { username: true, email: true } }, changer: { select: { username: true, full_name: true } } },
            }),
        ]);
        return { page, limit, total, total_pages: Math.ceil(total / limit), items, pending_requests: pending, recent_history: recentHistory, mutations: { allowed_here: true, authority: 'Customer-scoped direct provisioning or approved customer request workflow' } };
    }

    async getNotificationGovernance(query: SystemAdministrationPageQueryDto) {
        const { page, limit, skip } = this.page(query);
        const [total, items, byDelivery, bySeverity] = await Promise.all([
            this.prisma.notifications.count(),
            this.prisma.notifications.findMany({
                skip, take: limit, orderBy: { created_at: 'desc' },
                select: { id: true, notification_type: true, category: true, title: true, severity: true, channel: true, delivery_status: true, status: true, due_date: true, created_at: true, users: { select: { username: true, full_name: true } } },
            }),
            this.prisma.notifications.groupBy({ by: ['delivery_status'], _count: { id: true } }),
            this.prisma.notifications.groupBy({ by: ['severity'], _count: { id: true } }),
        ]);
        return { page, limit, total, total_pages: Math.ceil(total / limit), items, by_delivery: byDelivery.map((row) => ({ status: row.delivery_status, count: row._count.id })), by_severity: bySeverity.map((row) => ({ severity: row.severity, count: row._count.id })), scheduler: this.scheduler.getStatus() };
    }

    async getImportGovernance(query: SystemAdministrationPageQueryDto) {
        const { page, limit, skip } = this.page(query);
        const [total, items] = await Promise.all([
            this.prisma.import_jobs.count(),
            this.prisma.import_jobs.findMany({ skip, take: limit, orderBy: { created_at: 'desc' }, select: { id: true, entity_type: true, import_mode: true, source_file_name: true, status: true, total_rows: true, valid_rows: true, invalid_rows: true, duplicate_rows: true, warning_rows: true, committed_rows: true, committed_at: true, created_at: true, imported_by: true } }),
        ]);
        return { page, limit, total, total_pages: Math.ceil(total / limit), items, supported_scope_remains_phase_7: true };
    }

    async getDocumentGovernance() {
        const [files, controlledDocuments, integrityEvents, sensitiveEvents] = await Promise.all([
            this.prisma.documentFile.count(),
            this.prisma.controlled_documents.count(),
            this.prisma.audit_logs.count({ where: { action: { contains: 'INTEGRITY' }, outcome: { in: ['failure', 'blocked'] } } }),
            this.prisma.audit_logs.findMany({ where: { OR: [{ entity_type: 'document_file' }, { action: { contains: 'DOCUMENT' } }] }, take: 25, orderBy: { created_at: 'desc' }, select: { id: true, action: true, entity_type: true, entity_id: true, outcome: true, created_at: true, users: { select: { username: true, full_name: true } } } }),
        ]);
        return { storage_provider: 'LOCAL_FILESYSTEM', raw_paths_exposed: false, document_file_count: files, controlled_document_count: controlledDocuments, recorded_integrity_failures: integrityEvents, recent_sensitive_events: sensitiveEvents, full_storage_scan_performed: false };
    }

    async getDetailedHealth() {
        const startedAt = Date.now();
        let database: 'connected' | 'unavailable' = 'connected';
        let schema: 'compatible' | 'incompatible' | 'unavailable' = 'compatible';
        let storage: 'writable' | 'unavailable' = 'writable';
        try { await this.prisma.$queryRaw`SELECT 1 AS health_check`; } catch { database = 'unavailable'; schema = 'unavailable'; }
        if (database === 'connected') {
            try { await this.databaseSchema.assertCompatible(); } catch { schema = 'incompatible'; }
        }
        try { assertStorageWritable(getStorageConfig()); } catch { storage = 'unavailable'; }
        const migrations = database === 'connected'
            ? await this.prisma.$queryRawUnsafe<Array<{ migration_count: number; latest_migration: string | null }>>(
                "SELECT COUNT(*) AS migration_count, MAX(migration_name) AS latest_migration FROM [_prisma_migrations] WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
            ).catch(() => [])
            : [];
        const release = getReleaseMetadata();
        return {
            status: database === 'connected' && schema === 'compatible' && storage === 'writable' ? 'ok' : 'degraded',
            application: { alive: true, version: release.version, build_identifier: release.build_identifier, release_channel: release.release_channel, environment_category: process.env.NODE_ENV ?? 'development' },
            database: { status: database, schema, migration_count: Number(migrations[0]?.migration_count ?? 0), latest_migration: migrations[0]?.latest_migration ?? null },
            storage: { status: storage, provider: 'LOCAL_FILESYSTEM' },
            scheduler: this.scheduler.getStatus(),
            response_time_ms: Date.now() - startedAt,
            secrets_exposed: false,
        };
    }
}

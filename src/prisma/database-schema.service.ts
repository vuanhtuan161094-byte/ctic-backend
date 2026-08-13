import {
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common';

import {
    PrismaService,
} from './prisma.service';

export interface DatabaseSchemaCheckResult {
    compatible: boolean;
    missingTables: string[];
    missingColumns: string[];
    missingIndexes: string[];
}

@Injectable()
export class DatabaseSchemaService {
    private readonly logger =
        new Logger(
            DatabaseSchemaService.name,
        );

    constructor(
        private readonly prisma:
            PrismaService,
    ) { }

    async check():
        Promise<DatabaseSchemaCheckResult> {
        const rows =
            await this.prisma.$queryRawUnsafe<
                Array<Record<string, number | bigint>>
            >(`
                SELECT
                    CASE WHEN OBJECT_ID(N'dbo.certification_application_sites', N'U') IS NULL THEN 0 ELSE 1 END AS table_certification_application_sites,
                    CASE WHEN OBJECT_ID(N'dbo.application_review_actions', N'U') IS NULL THEN 0 ELSE 1 END AS table_application_review_actions,
                    CASE WHEN OBJECT_ID(N'dbo.certification_body_capabilities', N'U') IS NULL THEN 0 ELSE 1 END AS table_certification_body_capabilities,
                    CASE WHEN OBJECT_ID(N'dbo.application_review_capability_snapshots', N'U') IS NULL THEN 0 ELSE 1 END AS table_application_review_capability_snapshots,
                    CASE WHEN OBJECT_ID(N'dbo.expert_work_experiences', N'U') IS NULL THEN 0 ELSE 1 END AS table_expert_work_experiences,
                    CASE WHEN OBJECT_ID(N'dbo.expert_certificates', N'U') IS NULL THEN 0 ELSE 1 END AS table_expert_certificates,
                    CASE WHEN OBJECT_ID(N'dbo.audit_program_manday_requirements', N'U') IS NULL THEN 0 ELSE 1 END AS table_audit_program_manday_requirements,
                    CASE WHEN OBJECT_ID(N'dbo.audit_member_program_mandays', N'U') IS NULL THEN 0 ELSE 1 END AS table_audit_member_program_mandays,
                    CASE WHEN OBJECT_ID(N'dbo.audit_manday_allocation_versions', N'U') IS NULL THEN 0 ELSE 1 END AS table_audit_manday_allocation_versions,

                    CASE WHEN COL_LENGTH(N'dbo.document_files', N'sha256') IS NULL THEN 0 ELSE 1 END AS document_files_sha256,
                    CASE WHEN COL_LENGTH(N'dbo.audit_logs', N'request_id') IS NULL THEN 0 ELSE 1 END AS audit_logs_request_id,
                    CASE WHEN COL_LENGTH(N'dbo.audit_logs', N'outcome') IS NULL THEN 0 ELSE 1 END AS audit_logs_outcome,
                    CASE WHEN COL_LENGTH(N'dbo.audit_logs', N'status_code') IS NULL THEN 0 ELSE 1 END AS audit_logs_status_code,
                    CASE WHEN COL_LENGTH(N'dbo.audit_logs', N'duration_ms') IS NULL THEN 0 ELSE 1 END AS audit_logs_duration_ms,
                    CASE WHEN COL_LENGTH(N'dbo.certification_applications', N'declaration_accepted') IS NULL THEN 0 ELSE 1 END AS certification_applications_declaration_accepted,
                    CASE WHEN COL_LENGTH(N'dbo.application_reviews', N'workflow_status') IS NULL THEN 0 ELSE 1 END AS application_reviews_workflow_status,
                    CASE WHEN COL_LENGTH(N'dbo.application_reviews', N'proposed_auditors_json') IS NULL THEN 0 ELSE 1 END AS application_reviews_proposed_auditors_json,
                    CASE WHEN COL_LENGTH(N'dbo.application_reviews', N'industry_scopes_json') IS NULL THEN 0 ELSE 1 END AS application_reviews_industry_scopes_json,
                    CASE WHEN COL_LENGTH(N'dbo.experts', N'user_id') IS NULL THEN 0 ELSE 1 END AS experts_user_id,
                    CASE WHEN COL_LENGTH(N'dbo.experts', N'profile_status') IS NULL THEN 0 ELSE 1 END AS experts_profile_status,
                    CASE WHEN COL_LENGTH(N'dbo.expert_competencies', N'scope_description') IS NULL THEN 0 ELSE 1 END AS expert_competencies_scope_description,

                    CASE WHEN EXISTS (
                        SELECT 1
                        FROM sys.indexes
                        WHERE object_id = OBJECT_ID(N'dbo.audit_logs')
                          AND name = N'IX_audit_logs_request_id'
                    ) THEN 1 ELSE 0 END AS ix_audit_logs_request_id,
                    CASE WHEN EXISTS (
                        SELECT 1
                        FROM sys.indexes
                        WHERE object_id = OBJECT_ID(N'dbo.audit_logs')
                          AND name = N'IX_audit_logs_outcome_created'
                    ) THEN 1 ELSE 0 END AS ix_audit_logs_outcome_created;
            `);

        const row = rows[0] ?? {};
        const missingTables: string[] = [];
        const missingColumns: string[] = [];
        const missingIndexes: string[] = [];

        const present = (
            value: number | bigint | undefined,
        ) => Number(value ?? 0) === 1;

        const requiredTables: Array<[string, string]> = [
            ['table_certification_application_sites', 'dbo.certification_application_sites'],
            ['table_application_review_actions', 'dbo.application_review_actions'],
            ['table_certification_body_capabilities', 'dbo.certification_body_capabilities'],
            ['table_application_review_capability_snapshots', 'dbo.application_review_capability_snapshots'],
            ['table_expert_work_experiences', 'dbo.expert_work_experiences'],
            ['table_expert_certificates', 'dbo.expert_certificates'],
            ['table_audit_program_manday_requirements', 'dbo.audit_program_manday_requirements'],
            ['table_audit_member_program_mandays', 'dbo.audit_member_program_mandays'],
            ['table_audit_manday_allocation_versions', 'dbo.audit_manday_allocation_versions'],
        ];

        const requiredColumns: Array<[string, string]> = [
            ['document_files_sha256', 'dbo.document_files.sha256'],
            ['audit_logs_request_id', 'dbo.audit_logs.request_id'],
            ['audit_logs_outcome', 'dbo.audit_logs.outcome'],
            ['audit_logs_status_code', 'dbo.audit_logs.status_code'],
            ['audit_logs_duration_ms', 'dbo.audit_logs.duration_ms'],
            ['certification_applications_declaration_accepted', 'dbo.certification_applications.declaration_accepted'],
            ['application_reviews_workflow_status', 'dbo.application_reviews.workflow_status'],
            ['application_reviews_proposed_auditors_json', 'dbo.application_reviews.proposed_auditors_json'],
            ['application_reviews_industry_scopes_json', 'dbo.application_reviews.industry_scopes_json'],
            ['experts_user_id', 'dbo.experts.user_id'],
            ['experts_profile_status', 'dbo.experts.profile_status'],
            ['expert_competencies_scope_description', 'dbo.expert_competencies.scope_description'],
        ];

        for (const [key, label] of requiredTables) {
            if (!present(row[key])) missingTables.push(label);
        }

        for (const [key, label] of requiredColumns) {
            if (!present(row[key])) missingColumns.push(label);
        }

        if (!present(row.ix_audit_logs_request_id)) {
            missingIndexes.push('dbo.audit_logs.IX_audit_logs_request_id');
        }
        if (!present(row.ix_audit_logs_outcome_created)) {
            missingIndexes.push('dbo.audit_logs.IX_audit_logs_outcome_created');
        }

        return {
            compatible:
                missingTables.length === 0 &&
                missingColumns.length === 0,
            missingTables,
            missingColumns,
            missingIndexes,
        };
    }

    async assertCompatible():
        Promise<void> {
        let result: DatabaseSchemaCheckResult;

        try {
            result = await this.check();
        } catch (error) {
            if (!this.prisma.isDatabaseUnavailableError(error)) {
                throw error;
            }

            this.logger.warn(
                'Kết nối SQL Server gián đoạn trong lúc kiểm schema. Đang thử khôi phục...',
            );

            await this.prisma.waitForDatabaseReady({
                maxAttempts: 2,
            });

            result = await this.check();
        }

        if (result.missingIndexes.length > 0) {
            this.logger.warn(
                `Thiếu index database: ${result.missingIndexes.join(', ')}. Chạy "npm run db:stabilize" để đồng bộ.`,
            );
        }

        if (result.compatible) {
            this.logger.log(
                'Database schema compatible',
            );
            return;
        }

        const details = [
            ...result.missingTables,
            ...result.missingColumns,
        ].join(', ');

        this.logger.error(
            `Database schema chưa đồng bộ. Thiếu: ${details}`,
        );

        throw new ServiceUnavailableException(
            'Cơ sở dữ liệu chưa đồng bộ với phiên bản phần mềm. Dừng backend và chạy "npm run stabilize:commercial", sau đó khởi động lại.',
        );
    }
}

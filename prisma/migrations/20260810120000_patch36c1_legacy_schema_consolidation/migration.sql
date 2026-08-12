SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    /*
      Patch 36C.1 - consolidate legacy additive upgrade scripts into Prisma Migrate.
      This migration is intentionally idempotent so it is safe for:
      - existing databases that previously received manual SQL upgrades;
      - fresh databases created from 00000000000000_baseline.
      It does not contain demo/customer-specific data fixes.
    */

    IF OBJECT_ID(N'dbo.certification_applications', N'U') IS NULL
        THROW 51101, N'Missing dbo.certification_applications; baseline is not compatible.', 1;
    IF OBJECT_ID(N'dbo.application_reviews', N'U') IS NULL
        THROW 51102, N'Missing dbo.application_reviews; baseline is not compatible.', 1;
    IF OBJECT_ID(N'dbo.experts', N'U') IS NULL
        THROW 51103, N'Missing dbo.experts; baseline is not compatible.', 1;
    IF OBJECT_ID(N'dbo.expert_competencies', N'U') IS NULL
        THROW 51104, N'Missing dbo.expert_competencies; baseline is not compatible.', 1;

    /* Certification application extended form */
    IF COL_LENGTH(N'dbo.certification_applications', N'other_certification_type') IS NULL
        ALTER TABLE dbo.certification_applications ADD other_certification_type NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'company_name_en') IS NULL
        ALTER TABLE dbo.certification_applications ADD company_name_en NVARCHAR(255) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'headquarters_address') IS NULL
        ALTER TABLE dbo.certification_applications ADD headquarters_address NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'representative_name') IS NULL
        ALTER TABLE dbo.certification_applications ADD representative_name NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'representative_position') IS NULL
        ALTER TABLE dbo.certification_applications ADD representative_position NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'representative_phone') IS NULL
        ALTER TABLE dbo.certification_applications ADD representative_phone NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'representative_fax') IS NULL
        ALTER TABLE dbo.certification_applications ADD representative_fax NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'representative_email') IS NULL
        ALTER TABLE dbo.certification_applications ADD representative_email NVARCHAR(255) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'contact_name') IS NULL
        ALTER TABLE dbo.certification_applications ADD contact_name NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'contact_position') IS NULL
        ALTER TABLE dbo.certification_applications ADD contact_position NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'contact_phone') IS NULL
        ALTER TABLE dbo.certification_applications ADD contact_phone NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'contact_fax') IS NULL
        ALTER TABLE dbo.certification_applications ADD contact_fax NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'contact_email') IS NULL
        ALTER TABLE dbo.certification_applications ADD contact_email NVARCHAR(255) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'total_employee_count') IS NULL
        ALTER TABLE dbo.certification_applications ADD total_employee_count INT NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'shift1_count') IS NULL
        ALTER TABLE dbo.certification_applications ADD shift1_count INT NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'shift2_count') IS NULL
        ALTER TABLE dbo.certification_applications ADD shift2_count INT NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'shift3_count') IS NULL
        ALTER TABLE dbo.certification_applications ADD shift3_count INT NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'excluded_clauses') IS NULL
        ALTER TABLE dbo.certification_applications ADD excluded_clauses NVARCHAR(500) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'external_provider_used') IS NULL
        ALTER TABLE dbo.certification_applications ADD external_provider_used BIT NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'outsourced_processes') IS NULL
        ALTER TABLE dbo.certification_applications ADD outsourced_processes NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'stage1_requested_date') IS NULL
        ALTER TABLE dbo.certification_applications ADD stage1_requested_date DATE NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'stage2_requested_date') IS NULL
        ALTER TABLE dbo.certification_applications ADD stage2_requested_date DATE NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'other_management_systems') IS NULL
        ALTER TABLE dbo.certification_applications ADD other_management_systems BIT NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'management_system_details') IS NULL
        ALTER TABLE dbo.certification_applications ADD management_system_details NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'associated_documents') IS NULL
        ALTER TABLE dbo.certification_applications ADD associated_documents NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'consultant_organization') IS NULL
        ALTER TABLE dbo.certification_applications ADD consultant_organization NVARCHAR(255) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'consultant_name') IS NULL
        ALTER TABLE dbo.certification_applications ADD consultant_name NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'certificate_languages') IS NULL
        ALTER TABLE dbo.certification_applications ADD certificate_languages NVARCHAR(255) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'other_requests') IS NULL
        ALTER TABLE dbo.certification_applications ADD other_requests NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.certification_applications', N'declaration_accepted') IS NULL
        ALTER TABLE dbo.certification_applications
            ADD declaration_accepted BIT NOT NULL
                CONSTRAINT DF_certification_applications_declaration_accepted DEFAULT (0) WITH VALUES;

    IF EXISTS (
        SELECT 1
        FROM sys.columns
        WHERE object_id = OBJECT_ID(N'dbo.certification_applications')
          AND name = N'standard_name'
          AND max_length < 1000
    )
        ALTER TABLE dbo.certification_applications ALTER COLUMN standard_name NVARCHAR(500) NOT NULL;

    IF OBJECT_ID(N'dbo.certification_application_sites', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.certification_application_sites (
            id UNIQUEIDENTIFIER NOT NULL
                CONSTRAINT PK_certification_application_sites PRIMARY KEY
                CONSTRAINT DF_certification_application_sites_id DEFAULT NEWID(),
            application_id UNIQUEIDENTIFIER NOT NULL,
            site_no INT NOT NULL,
            site_name NVARCHAR(255) NULL,
            address NVARCHAR(MAX) NOT NULL,
            activities NVARCHAR(MAX) NULL,
            employee_count INT NULL,
            is_headquarters BIT NOT NULL
                CONSTRAINT DF_certification_application_sites_is_headquarters DEFAULT (0),
            created_at DATETIME2 NOT NULL
                CONSTRAINT DF_certification_application_sites_created_at DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT UQ_certification_application_sites_application_site UNIQUE (application_id, site_no),
            CONSTRAINT FK_certification_application_sites_application
                FOREIGN KEY (application_id) REFERENCES dbo.certification_applications(id)
        );
    END;

    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE object_id = OBJECT_ID(N'dbo.certification_application_sites')
          AND name = N'IX_certification_application_sites_application_id'
    )
        EXEC sys.sp_executesql N'
            CREATE INDEX IX_certification_application_sites_application_id
                ON dbo.certification_application_sites(application_id);';

    /* Application review extended fields / IMS / industry / two-level workflow */
    IF COL_LENGTH(N'dbo.application_reviews', N'review_items_json') IS NULL
        ALTER TABLE dbo.application_reviews ADD review_items_json NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'audit_field') IS NULL
        ALTER TABLE dbo.application_reviews ADD audit_field NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'iaf_code') IS NULL
        ALTER TABLE dbo.application_reviews ADD iaf_code NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'isic_code') IS NULL
        ALTER TABLE dbo.application_reviews ADD isic_code NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'proposed_auditor_id') IS NULL
        ALTER TABLE dbo.application_reviews ADD proposed_auditor_id UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'proposed_auditors_json') IS NULL
        ALTER TABLE dbo.application_reviews ADD proposed_auditors_json NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'industry_scopes_json') IS NULL
        ALTER TABLE dbo.application_reviews ADD industry_scopes_json NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'ims_integration_criteria_json') IS NULL
        ALTER TABLE dbo.application_reviews ADD ims_integration_criteria_json NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'ims_integration_percent') IS NULL
        ALTER TABLE dbo.application_reviews ADD ims_integration_percent DECIMAL(5,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'combined_audit_capability_percent') IS NULL
        ALTER TABLE dbo.application_reviews ADD combined_audit_capability_percent DECIMAL(5,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'effective_personnel') IS NULL
        ALTER TABLE dbo.application_reviews ADD effective_personnel INT NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'risk_level') IS NULL
        ALTER TABLE dbo.application_reviews ADD risk_level NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'manday_method') IS NULL
        ALTER TABLE dbo.application_reviews ADD manday_method NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'base_mandays') IS NULL
        ALTER TABLE dbo.application_reviews ADD base_mandays DECIMAL(10,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'increase_factors') IS NULL
        ALTER TABLE dbo.application_reviews ADD increase_factors NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'increase_percent') IS NULL
        ALTER TABLE dbo.application_reviews ADD increase_percent DECIMAL(5,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'reduction_factors') IS NULL
        ALTER TABLE dbo.application_reviews ADD reduction_factors NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'reduction_percent') IS NULL
        ALTER TABLE dbo.application_reviews ADD reduction_percent DECIMAL(5,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'integration_reduction_percent') IS NULL
        ALTER TABLE dbo.application_reviews ADD integration_reduction_percent DECIMAL(5,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'final_mandays') IS NULL
        ALTER TABLE dbo.application_reviews ADD final_mandays DECIMAL(10,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'stage1_mandays') IS NULL
        ALTER TABLE dbo.application_reviews ADD stage1_mandays DECIMAL(10,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'stage2_mandays') IS NULL
        ALTER TABLE dbo.application_reviews ADD stage2_mandays DECIMAL(10,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'surveillance_mandays') IS NULL
        ALTER TABLE dbo.application_reviews ADD surveillance_mandays DECIMAL(10,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'recertification_mandays') IS NULL
        ALTER TABLE dbo.application_reviews ADD recertification_mandays DECIMAL(10,2) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'stage1_proposed_date') IS NULL
        ALTER TABLE dbo.application_reviews ADD stage1_proposed_date DATE NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'stage2_proposed_date') IS NULL
        ALTER TABLE dbo.application_reviews ADD stage2_proposed_date DATE NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'surveillance1_date') IS NULL
        ALTER TABLE dbo.application_reviews ADD surveillance1_date DATE NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'surveillance2_date') IS NULL
        ALTER TABLE dbo.application_reviews ADD surveillance2_date DATE NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'recertification_date') IS NULL
        ALTER TABLE dbo.application_reviews ADD recertification_date DATE NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'conclusion') IS NULL
        ALTER TABLE dbo.application_reviews ADD conclusion NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'client_code') IS NULL
        ALTER TABLE dbo.application_reviews ADD client_code NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'checked_by_name') IS NULL
        ALTER TABLE dbo.application_reviews ADD checked_by_name NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'approved_by_name') IS NULL
        ALTER TABLE dbo.application_reviews ADD approved_by_name NVARCHAR(100) NULL;

    DECLARE @workflow_status_added BIT = 0;
    IF COL_LENGTH(N'dbo.application_reviews', N'workflow_status') IS NULL
    BEGIN
        SET @workflow_status_added = 1;
        ALTER TABLE dbo.application_reviews
            ADD workflow_status NVARCHAR(30) NOT NULL
                CONSTRAINT DF_application_reviews_workflow_status DEFAULT(N'PENDING_CHECK') WITH VALUES;
    END;

    IF COL_LENGTH(N'dbo.application_reviews', N'prepared_by_id') IS NULL
        ALTER TABLE dbo.application_reviews ADD prepared_by_id UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'checker_id') IS NULL
        ALTER TABLE dbo.application_reviews ADD checker_id UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'approver_id') IS NULL
        ALTER TABLE dbo.application_reviews ADD approver_id UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'submitted_at') IS NULL
        ALTER TABLE dbo.application_reviews ADD submitted_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'checked_at') IS NULL
        ALTER TABLE dbo.application_reviews ADD checked_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'approved_at') IS NULL
        ALTER TABLE dbo.application_reviews ADD approved_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'returned_at') IS NULL
        ALTER TABLE dbo.application_reviews ADD returned_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'checker_comment') IS NULL
        ALTER TABLE dbo.application_reviews ADD checker_comment NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.application_reviews', N'approver_comment') IS NULL
        ALTER TABLE dbo.application_reviews ADD approver_comment NVARCHAR(MAX) NULL;

    IF @workflow_status_added = 1
    BEGIN
        EXEC sys.sp_executesql N'
            UPDATE r
            SET
                workflow_status = CASE
                    WHEN LOWER(a.status) IN (N''accepted'', N''rejected'', N''need_more_info'') THEN N''APPROVED''
                    ELSE N''PENDING_CHECK''
                END,
                prepared_by_id = COALESCE(r.prepared_by_id, r.reviewer_id),
                submitted_at = COALESCE(r.submitted_at, r.created_at),
                approved_at = CASE
                    WHEN LOWER(a.status) IN (N''accepted'', N''rejected'', N''need_more_info'')
                    THEN COALESCE(r.approved_at, r.created_at)
                    ELSE r.approved_at
                END
            FROM dbo.application_reviews r
            INNER JOIN dbo.certification_applications a ON a.id = r.application_id;';
    END;

    IF OBJECT_ID(N'dbo.application_review_actions', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.application_review_actions (
            id UNIQUEIDENTIFIER NOT NULL
                CONSTRAINT PK_application_review_actions PRIMARY KEY
                CONSTRAINT DF_application_review_actions_id DEFAULT NEWID(),
            review_id UNIQUEIDENTIFIER NOT NULL,
            action NVARCHAR(40) NOT NULL,
            from_status NVARCHAR(30) NULL,
            to_status NVARCHAR(30) NOT NULL,
            actor_id UNIQUEIDENTIFIER NOT NULL,
            comment NVARCHAR(MAX) NULL,
            created_at DATETIME2 NOT NULL
                CONSTRAINT DF_application_review_actions_created_at DEFAULT CURRENT_TIMESTAMP
        );
    END;

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_application_reviews_proposed_auditor')
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.application_reviews ADD CONSTRAINT FK_application_reviews_proposed_auditor
                FOREIGN KEY (proposed_auditor_id) REFERENCES dbo.experts(id);';
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_application_reviews_prepared_by')
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.application_reviews ADD CONSTRAINT FK_application_reviews_prepared_by
                FOREIGN KEY (prepared_by_id) REFERENCES dbo.users(id);';
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_application_reviews_checker')
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.application_reviews ADD CONSTRAINT FK_application_reviews_checker
                FOREIGN KEY (checker_id) REFERENCES dbo.users(id);';
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_application_reviews_approver')
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.application_reviews ADD CONSTRAINT FK_application_reviews_approver
                FOREIGN KEY (approver_id) REFERENCES dbo.users(id);';
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_application_review_actions_review')
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.application_review_actions ADD CONSTRAINT FK_application_review_actions_review
                FOREIGN KEY (review_id) REFERENCES dbo.application_reviews(id);';
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_application_review_actions_actor')
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.application_review_actions ADD CONSTRAINT FK_application_review_actions_actor
                FOREIGN KEY (actor_id) REFERENCES dbo.users(id);';

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_application_reviews_proposed_auditor_id' AND object_id = OBJECT_ID(N'dbo.application_reviews'))
        EXEC sys.sp_executesql N'CREATE INDEX IX_application_reviews_proposed_auditor_id ON dbo.application_reviews(proposed_auditor_id);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_application_reviews_workflow_status' AND object_id = OBJECT_ID(N'dbo.application_reviews'))
        EXEC sys.sp_executesql N'CREATE INDEX IX_application_reviews_workflow_status ON dbo.application_reviews(workflow_status);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_application_reviews_checker_id' AND object_id = OBJECT_ID(N'dbo.application_reviews'))
        EXEC sys.sp_executesql N'CREATE INDEX IX_application_reviews_checker_id ON dbo.application_reviews(checker_id);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_application_reviews_approver_id' AND object_id = OBJECT_ID(N'dbo.application_reviews'))
        EXEC sys.sp_executesql N'CREATE INDEX IX_application_reviews_approver_id ON dbo.application_reviews(approver_id);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_application_review_actions_review_created' AND object_id = OBJECT_ID(N'dbo.application_review_actions'))
        EXEC sys.sp_executesql N'CREATE INDEX IX_application_review_actions_review_created ON dbo.application_review_actions(review_id, created_at DESC);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_application_review_actions_actor_id' AND object_id = OBJECT_ID(N'dbo.application_review_actions'))
        EXEC sys.sp_executesql N'CREATE INDEX IX_application_review_actions_actor_id ON dbo.application_review_actions(actor_id);';

    /* Expert profile extension */
    DECLARE @expert_profile_added BIT = 0;
    IF COL_LENGTH(N'dbo.experts', N'user_id') IS NULL
        ALTER TABLE dbo.experts ADD user_id UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH(N'dbo.experts', N'employee_code') IS NULL
        ALTER TABLE dbo.experts ADD employee_code NVARCHAR(50) NULL;
    IF COL_LENGTH(N'dbo.experts', N'date_of_birth') IS NULL
        ALTER TABLE dbo.experts ADD date_of_birth DATE NULL;
    IF COL_LENGTH(N'dbo.experts', N'gender') IS NULL
        ALTER TABLE dbo.experts ADD gender NVARCHAR(20) NULL;
    IF COL_LENGTH(N'dbo.experts', N'address') IS NULL
        ALTER TABLE dbo.experts ADD address NVARCHAR(500) NULL;
    IF COL_LENGTH(N'dbo.experts', N'employment_type') IS NULL
        ALTER TABLE dbo.experts ADD employment_type NVARCHAR(30) NULL;
    IF COL_LENGTH(N'dbo.experts', N'organization') IS NULL
        ALTER TABLE dbo.experts ADD organization NVARCHAR(255) NULL;
    IF COL_LENGTH(N'dbo.experts', N'job_title') IS NULL
        ALTER TABLE dbo.experts ADD job_title NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.experts', N'education_level') IS NULL
        ALTER TABLE dbo.experts ADD education_level NVARCHAR(100) NULL;
    IF COL_LENGTH(N'dbo.experts', N'specialization') IS NULL
        ALTER TABLE dbo.experts ADD specialization NVARCHAR(255) NULL;
    IF COL_LENGTH(N'dbo.experts', N'education_summary') IS NULL
        ALTER TABLE dbo.experts ADD education_summary NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.experts', N'experience_summary') IS NULL
        ALTER TABLE dbo.experts ADD experience_summary NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.experts', N'profile_status') IS NULL
    BEGIN
        SET @expert_profile_added = 1;
        ALTER TABLE dbo.experts
            ADD profile_status NVARCHAR(30) NOT NULL
                CONSTRAINT DF_experts_profile_status DEFAULT(N'DRAFT') WITH VALUES;
    END;
    IF COL_LENGTH(N'dbo.experts', N'approved_by') IS NULL
        ALTER TABLE dbo.experts ADD approved_by UNIQUEIDENTIFIER NULL;
    IF COL_LENGTH(N'dbo.experts', N'approved_at') IS NULL
        ALTER TABLE dbo.experts ADD approved_at DATETIME2 NULL;
    IF COL_LENGTH(N'dbo.experts', N'suspension_reason') IS NULL
        ALTER TABLE dbo.experts ADD suspension_reason NVARCHAR(MAX) NULL;
    IF COL_LENGTH(N'dbo.experts', N'created_at') IS NULL
        ALTER TABLE dbo.experts ADD created_at DATETIME2 NOT NULL
            CONSTRAINT DF_experts_created_at DEFAULT CURRENT_TIMESTAMP WITH VALUES;
    IF COL_LENGTH(N'dbo.experts', N'updated_at') IS NULL
        ALTER TABLE dbo.experts ADD updated_at DATETIME2 NOT NULL
            CONSTRAINT DF_experts_updated_at DEFAULT CURRENT_TIMESTAMP WITH VALUES;

    IF @expert_profile_added = 1
    BEGIN
        /* Existing active experts predate the approval workflow; grandfather them to preserve operations. */
        EXEC sys.sp_executesql N'
            UPDATE dbo.experts
            SET profile_status = N''APPROVED'',
                approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)
            WHERE LOWER(COALESCE(status, N''active'')) = N''active'';';
    END;

    /* Link legacy expert profile to exactly one matching user email when unambiguous. */
    EXEC sys.sp_executesql N'
        UPDATE e
        SET e.user_id = u.id
        FROM dbo.experts e
        INNER JOIN dbo.users u
            ON LOWER(LTRIM(RTRIM(e.email))) = LOWER(LTRIM(RTRIM(u.email)))
        WHERE e.user_id IS NULL
          AND e.email IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM dbo.experts other
              WHERE other.id <> e.id AND other.user_id = u.id
          );';

    IF COL_LENGTH(N'dbo.expert_competencies', N'scope_description') IS NULL
        ALTER TABLE dbo.expert_competencies ADD scope_description NVARCHAR(MAX) NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_experts_user_account')
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.experts ADD CONSTRAINT FK_experts_user_account
                FOREIGN KEY (user_id) REFERENCES dbo.users(id);';
    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_experts_approved_by')
        EXEC sys.sp_executesql N'
            ALTER TABLE dbo.experts ADD CONSTRAINT FK_experts_approved_by
                FOREIGN KEY (approved_by) REFERENCES dbo.users(id);';

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.experts') AND name = N'UX_experts_user_id')
        EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_experts_user_id ON dbo.experts(user_id) WHERE user_id IS NOT NULL;';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.experts') AND name = N'UX_experts_employee_code')
        EXEC sys.sp_executesql N'CREATE UNIQUE INDEX UX_experts_employee_code ON dbo.experts(employee_code) WHERE employee_code IS NOT NULL;';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.experts') AND name = N'IX_experts_profile_status')
        EXEC sys.sp_executesql N'CREATE INDEX IX_experts_profile_status ON dbo.experts(profile_status);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.experts') AND name = N'IX_experts_status')
        CREATE INDEX IX_experts_status ON dbo.experts(status);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.experts') AND name = N'IX_experts_approved_by')
        EXEC sys.sp_executesql N'CREATE INDEX IX_experts_approved_by ON dbo.experts(approved_by);';

    IF OBJECT_ID(N'dbo.expert_work_experiences', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.expert_work_experiences (
            id UNIQUEIDENTIFIER NOT NULL
                CONSTRAINT PK_expert_work_experiences PRIMARY KEY
                CONSTRAINT DF_expert_work_experiences_id DEFAULT NEWID(),
            expert_id UNIQUEIDENTIFIER NOT NULL,
            organization NVARCHAR(255) NOT NULL,
            position NVARCHAR(150) NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NULL,
            industry_codes NVARCHAR(500) NULL,
            responsibility NVARCHAR(MAX) NULL,
            achievement_note NVARCHAR(MAX) NULL,
            created_at DATETIME2 NOT NULL CONSTRAINT DF_expert_work_experiences_created_at DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME2 NOT NULL CONSTRAINT DF_expert_work_experiences_updated_at DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT FK_expert_work_experiences_expert FOREIGN KEY (expert_id) REFERENCES dbo.experts(id)
        );
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.expert_work_experiences') AND name = N'IX_expert_work_experiences_expert_id')
        EXEC sys.sp_executesql N'CREATE INDEX IX_expert_work_experiences_expert_id ON dbo.expert_work_experiences(expert_id);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.expert_work_experiences') AND name = N'IX_expert_work_experiences_start_date')
        EXEC sys.sp_executesql N'CREATE INDEX IX_expert_work_experiences_start_date ON dbo.expert_work_experiences(start_date);';

    IF OBJECT_ID(N'dbo.expert_certificates', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.expert_certificates (
            id UNIQUEIDENTIFIER NOT NULL
                CONSTRAINT PK_expert_certificates PRIMARY KEY
                CONSTRAINT DF_expert_certificates_id DEFAULT NEWID(),
            expert_id UNIQUEIDENTIFIER NOT NULL,
            certificate_type NVARCHAR(50) NOT NULL,
            certificate_name NVARCHAR(255) NOT NULL,
            certificate_number NVARCHAR(100) NULL,
            issuing_organization NVARCHAR(255) NULL,
            standard_code NVARCHAR(100) NULL,
            issue_date DATE NULL,
            expiry_date DATE NULL,
            credential_url NVARCHAR(1000) NULL,
            note NVARCHAR(MAX) NULL,
            created_at DATETIME2 NOT NULL CONSTRAINT DF_expert_certificates_created_at DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME2 NOT NULL CONSTRAINT DF_expert_certificates_updated_at DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT FK_expert_certificates_expert FOREIGN KEY (expert_id) REFERENCES dbo.experts(id)
        );
    END;
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.expert_certificates') AND name = N'IX_expert_certificates_expert_id')
        EXEC sys.sp_executesql N'CREATE INDEX IX_expert_certificates_expert_id ON dbo.expert_certificates(expert_id);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.expert_certificates') AND name = N'IX_expert_certificates_expiry_date')
        EXEC sys.sp_executesql N'CREATE INDEX IX_expert_certificates_expiry_date ON dbo.expert_certificates(expiry_date);';
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.expert_certificates') AND name = N'IX_expert_certificates_type')
        EXEC sys.sp_executesql N'CREATE INDEX IX_expert_certificates_type ON dbo.expert_certificates(certificate_type);';

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[expert_competency_evidences]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_competency_evidences] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_competency_evidence_id] DEFAULT NEWID(),
            [competency_id] UNIQUEIDENTIFIER NOT NULL,
            [evidence_type] NVARCHAR(50) NOT NULL,
            [title] NVARCHAR(255) NOT NULL,
            [reference_no] NVARCHAR(150) NULL,
            [evidence_date] DATE NULL,
            [valid_until] DATE NULL,
            [result] NVARCHAR(50) NULL,
            [score] DECIMAL(6,2) NULL,
            [mandays] DECIMAL(10,2) NULL,
            [description] NVARCHAR(MAX) NULL,
            [status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_expert_competency_evidence_status] DEFAULT N'ACTIVE',
            [added_by] UNIQUEIDENTIFIER NOT NULL,
            [voided_by] UNIQUEIDENTIFIER NULL,
            [voided_at] DATETIME2 NULL,
            [void_reason] NVARCHAR(MAX) NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_competency_evidence_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_competency_evidence_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_competency_evidences] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_competency_evidence_type] CHECK ([evidence_type] IN (
                N'TRAINING_CERTIFICATE', N'AUDIT_LOG', N'WORK_EXPERIENCE', N'WITNESS_ASSESSMENT',
                N'INTERVIEW_TEST', N'CUSTOMER_FEEDBACK', N'AUDIT_REPORT_REVIEW', N'OTHER'
            )),
            CONSTRAINT [CK_expert_competency_evidence_status] CHECK ([status] IN (N'ACTIVE', N'VOID')),
            CONSTRAINT [CK_expert_competency_evidence_score] CHECK ([score] IS NULL OR ([score] >= 0 AND [score] <= 100)),
            CONSTRAINT [CK_expert_competency_evidence_mandays] CHECK ([mandays] IS NULL OR [mandays] >= 0),
            CONSTRAINT [CK_expert_competency_evidence_dates] CHECK ([valid_until] IS NULL OR [evidence_date] IS NULL OR [valid_until] >= [evidence_date]),
            CONSTRAINT [FK_expert_competency_evidence_competency] FOREIGN KEY ([competency_id]) REFERENCES [dbo].[expert_competencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_competency_evidence_added_by] FOREIGN KEY ([added_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_competency_evidence_voided_by] FOREIGN KEY ([voided_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_expert_competency_evidence_competency_status]
            ON [dbo].[expert_competency_evidences]([competency_id], [status], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_expert_competency_evidence_type]
            ON [dbo].[expert_competency_evidences]([evidence_type]);
        CREATE NONCLUSTERED INDEX [IX_expert_competency_evidence_valid_until]
            ON [dbo].[expert_competency_evidences]([valid_until]);
        CREATE NONCLUSTERED INDEX [IX_expert_competency_evidence_added_by]
            ON [dbo].[expert_competency_evidences]([added_by]);
    END;

    IF OBJECT_ID(N'[dbo].[expert_competency_reviews]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_competency_reviews] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_competency_review_id] DEFAULT NEWID(),
            [competency_id] UNIQUEIDENTIFIER NOT NULL,
            [review_type] NVARCHAR(30) NOT NULL,
            [review_date] DATE NOT NULL,
            [monitoring_methods] NVARCHAR(500) NOT NULL,
            [score] DECIMAL(6,2) NULL,
            [result] NVARCHAR(40) NOT NULL,
            [finding] NVARCHAR(MAX) NULL,
            [required_action] NVARCHAR(MAX) NULL,
            [next_review_date] DATE NULL,
            [reviewed_by] UNIQUEIDENTIFIER NOT NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_competency_review_created_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_competency_reviews] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_competency_review_type] CHECK ([review_type] IN (N'PERIODIC', N'UNSCHEDULED', N'RENEWAL', N'SCOPE_EXTENSION')),
            CONSTRAINT [CK_expert_competency_review_result] CHECK ([result] IN (N'SATISFACTORY', N'IMPROVEMENT_REQUIRED', N'UNSATISFACTORY')),
            CONSTRAINT [CK_expert_competency_review_score] CHECK ([score] IS NULL OR ([score] >= 0 AND [score] <= 100)),
            CONSTRAINT [CK_expert_competency_review_dates] CHECK ([next_review_date] IS NULL OR [next_review_date] >= [review_date]),
            CONSTRAINT [FK_expert_competency_review_competency] FOREIGN KEY ([competency_id]) REFERENCES [dbo].[expert_competencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_competency_review_reviewed_by] FOREIGN KEY ([reviewed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_expert_competency_review_competency_date]
            ON [dbo].[expert_competency_reviews]([competency_id], [review_date]);
        CREATE NONCLUSTERED INDEX [IX_expert_competency_review_result]
            ON [dbo].[expert_competency_reviews]([result]);
        CREATE NONCLUSTERED INDEX [IX_expert_competency_review_next_date]
            ON [dbo].[expert_competency_reviews]([next_review_date]);
        CREATE NONCLUSTERED INDEX [IX_expert_competency_review_reviewed_by]
            ON [dbo].[expert_competency_reviews]([reviewed_by]);
    END;

    IF OBJECT_ID(N'[dbo].[expert_competency_actions]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_competency_actions] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_competency_action_id] DEFAULT NEWID(),
            [competency_id] UNIQUEIDENTIFIER NOT NULL,
            [action_type] NVARCHAR(40) NOT NULL,
            [from_status] NVARCHAR(30) NULL,
            [to_status] NVARCHAR(30) NULL,
            [reason] NVARCHAR(MAX) NULL,
            [snapshot_json] NVARCHAR(MAX) NULL,
            [actor_id] UNIQUEIDENTIFIER NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_competency_action_created_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_competency_actions] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_competency_action_type] CHECK ([action_type] IN (
                N'BASELINE', N'CREATE', N'UPDATE_DRAFT', N'APPROVE', N'SUSPEND', N'REACTIVATE', N'RENEW',
                N'REVIEW_RECORDED', N'EVIDENCE_ADDED', N'EVIDENCE_VOIDED'
            )),
            CONSTRAINT [FK_expert_competency_action_competency] FOREIGN KEY ([competency_id]) REFERENCES [dbo].[expert_competencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_competency_action_actor] FOREIGN KEY ([actor_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_expert_competency_action_competency_created]
            ON [dbo].[expert_competency_actions]([competency_id], [created_at]);
        CREATE NONCLUSTERED INDEX [IX_expert_competency_action_type]
            ON [dbo].[expert_competency_actions]([action_type]);
        CREATE NONCLUSTERED INDEX [IX_expert_competency_action_actor]
            ON [dbo].[expert_competency_actions]([actor_id]);

        INSERT INTO [dbo].[expert_competency_actions] (
            [id], [competency_id], [action_type], [from_status], [to_status], [reason], [snapshot_json], [actor_id], [created_at]
        )
        SELECT
            NEWID(),
            ec.[id],
            N'BASELINE',
            NULL,
            ec.[approval_status],
            N'Baseline imported when Phase 4A competency governance was enabled.',
            CONCAT(
                N'{"management_system":"', STRING_ESCAPE(ISNULL(ec.[management_system], N''), 'json'),
                N'","standard_code":"', STRING_ESCAPE(ISNULL(ec.[standard_code], N''), 'json'),
                N'","competency_role":"', STRING_ESCAPE(ISNULL(ec.[competency_role], N''), 'json'),
                N'","iaf_code":"', STRING_ESCAPE(ISNULL(ec.[iaf_code], N''), 'json'),
                N'","nace_code":"', STRING_ESCAPE(ISNULL(ec.[nace_code], N''), 'json'),
                N'","approval_status":"', STRING_ESCAPE(ISNULL(ec.[approval_status], N''), 'json'), N'"}'
            ),
            ec.[approved_by],
            COALESCE(ec.[approved_at], ec.[created_at], SYSUTCDATETIME())
        FROM [dbo].[expert_competencies] ec
        WHERE NOT EXISTS (
            SELECT 1
            FROM [dbo].[expert_competency_actions] a
            WHERE a.[competency_id] = ec.[id]
        );
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[expert_training_records]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_training_records] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_training_id] DEFAULT NEWID(),
            [expert_id] UNIQUEIDENTIFIER NOT NULL,
            [competency_id] UNIQUEIDENTIFIER NULL,
            [training_type] NVARCHAR(40) NOT NULL,
            [title] NVARCHAR(255) NOT NULL,
            [provider] NVARCHAR(255) NULL,
            [delivery_mode] NVARCHAR(30) NULL,
            [management_system] NVARCHAR(30) NULL,
            [standard_code] NVARCHAR(100) NULL,
            [start_date] DATE NOT NULL,
            [end_date] DATE NULL,
            [duration_hours] DECIMAL(8,2) NULL,
            [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_expert_training_status] DEFAULT N'PLANNED',
            [completion_result] NVARCHAR(50) NULL,
            [certificate_number] NVARCHAR(150) NULL,
            [note] NVARCHAR(MAX) NULL,
            [effectiveness_method] NVARCHAR(40) NULL,
            [effectiveness_score] DECIMAL(6,2) NULL,
            [effectiveness_result] NVARCHAR(40) NULL,
            [effectiveness_comment] NVARCHAR(MAX) NULL,
            [evaluated_at] DATETIME2 NULL,
            [evaluated_by] UNIQUEIDENTIFIER NULL,
            [created_by] UNIQUEIDENTIFIER NOT NULL,
            [cancelled_by] UNIQUEIDENTIFIER NULL,
            [cancelled_at] DATETIME2 NULL,
            [cancellation_reason] NVARCHAR(MAX) NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_training_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_training_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_training_records] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_training_type] CHECK ([training_type] IN (
                N'INTERNAL', N'EXTERNAL', N'AUDITOR_COURSE', N'SPECIALIZED', N'WITNESS_PRACTICE', N'OTHER'
            )),
            CONSTRAINT [CK_expert_training_delivery_mode] CHECK ([delivery_mode] IS NULL OR [delivery_mode] IN (
                N'IN_PERSON', N'ONLINE', N'HYBRID', N'OJT', N'OTHER'
            )),
            CONSTRAINT [CK_expert_training_status] CHECK ([status] IN (N'PLANNED', N'COMPLETED', N'CANCELLED')),
            CONSTRAINT [CK_expert_training_effectiveness_method] CHECK ([effectiveness_method] IS NULL OR [effectiveness_method] IN (
                N'PRESENTATION', N'INTERVIEW', N'TEST', N'OBSERVATION', N'OTHER'
            )),
            CONSTRAINT [CK_expert_training_effectiveness_result] CHECK ([effectiveness_result] IS NULL OR [effectiveness_result] IN (
                N'SATISFACTORY', N'IMPROVEMENT_REQUIRED', N'UNSATISFACTORY'
            )),
            CONSTRAINT [CK_expert_training_score] CHECK ([effectiveness_score] IS NULL OR ([effectiveness_score] >= 0 AND [effectiveness_score] <= 100)),
            CONSTRAINT [CK_expert_training_duration] CHECK ([duration_hours] IS NULL OR [duration_hours] >= 0),
            CONSTRAINT [CK_expert_training_dates] CHECK ([end_date] IS NULL OR [end_date] >= [start_date]),
            CONSTRAINT [FK_expert_training_expert] FOREIGN KEY ([expert_id]) REFERENCES [dbo].[experts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_training_competency] FOREIGN KEY ([competency_id]) REFERENCES [dbo].[expert_competencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_training_created_by] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_training_evaluated_by] FOREIGN KEY ([evaluated_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_training_cancelled_by] FOREIGN KEY ([cancelled_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_expert_training_expert_date]
            ON [dbo].[expert_training_records]([expert_id], [start_date]);
        CREATE NONCLUSTERED INDEX [IX_expert_training_competency]
            ON [dbo].[expert_training_records]([competency_id]);
        CREATE NONCLUSTERED INDEX [IX_expert_training_status_end]
            ON [dbo].[expert_training_records]([status], [end_date]);
        CREATE NONCLUSTERED INDEX [IX_expert_training_effectiveness]
            ON [dbo].[expert_training_records]([effectiveness_result]);
        CREATE NONCLUSTERED INDEX [IX_expert_training_created_by]
            ON [dbo].[expert_training_records]([created_by]);
    END;

    IF OBJECT_ID(N'[dbo].[expert_monitoring_records]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_monitoring_records] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_monitoring_id] DEFAULT NEWID(),
            [expert_id] UNIQUEIDENTIFIER NOT NULL,
            [competency_id] UNIQUEIDENTIFIER NULL,
            [monitoring_method] NVARCHAR(40) NOT NULL,
            [monitoring_content] NVARCHAR(500) NOT NULL,
            [plan_type] NVARCHAR(30) NOT NULL CONSTRAINT [DF_expert_monitoring_plan_type] DEFAULT N'SCHEDULED',
            [planned_date] DATE NOT NULL,
            [due_date] DATE NULL,
            [management_system] NVARCHAR(30) NULL,
            [standard_code] NVARCHAR(100) NULL,
            [audit_plan_id] UNIQUEIDENTIFIER NULL,
            [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_expert_monitoring_status] DEFAULT N'PLANNED',
            [performed_date] DATE NULL,
            [assessor_user_id] UNIQUEIDENTIFIER NULL,
            [result] NVARCHAR(40) NULL,
            [score] DECIMAL(6,2) NULL,
            [summary] NVARCHAR(MAX) NULL,
            [finding] NVARCHAR(MAX) NULL,
            [required_action] NVARCHAR(MAX) NULL,
            [next_monitoring_date] DATE NULL,
            [created_by] UNIQUEIDENTIFIER NOT NULL,
            [completed_by] UNIQUEIDENTIFIER NULL,
            [cancelled_by] UNIQUEIDENTIFIER NULL,
            [cancelled_at] DATETIME2 NULL,
            [cancellation_reason] NVARCHAR(MAX) NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_monitoring_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_monitoring_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_monitoring_records] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_monitoring_method] CHECK ([monitoring_method] IN (
                N'WITNESS', N'AUDIT_REPORT_REVIEW', N'CUSTOMER_FEEDBACK', N'MARKET_FEEDBACK',
                N'INTERVIEW', N'THEORY_TEST', N'SITUATION_TEST', N'OTHER'
            )),
            CONSTRAINT [CK_expert_monitoring_plan_type] CHECK ([plan_type] IN (N'SCHEDULED', N'UNSCHEDULED')),
            CONSTRAINT [CK_expert_monitoring_status] CHECK ([status] IN (N'PLANNED', N'COMPLETED', N'CANCELLED')),
            CONSTRAINT [CK_expert_monitoring_result] CHECK ([result] IS NULL OR [result] IN (
                N'SATISFACTORY', N'IMPROVEMENT_REQUIRED', N'UNSATISFACTORY'
            )),
            CONSTRAINT [CK_expert_monitoring_score] CHECK ([score] IS NULL OR ([score] >= 0 AND [score] <= 100)),
            CONSTRAINT [CK_expert_monitoring_dates] CHECK ([due_date] IS NULL OR [due_date] >= [planned_date]),
            CONSTRAINT [CK_expert_monitoring_next_date] CHECK ([next_monitoring_date] IS NULL OR [performed_date] IS NULL OR [next_monitoring_date] >= [performed_date]),
            CONSTRAINT [FK_expert_monitoring_expert] FOREIGN KEY ([expert_id]) REFERENCES [dbo].[experts]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_monitoring_competency] FOREIGN KEY ([competency_id]) REFERENCES [dbo].[expert_competencies]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_monitoring_audit_plan] FOREIGN KEY ([audit_plan_id]) REFERENCES [dbo].[audit_plans]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_monitoring_created_by] FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_monitoring_assessor] FOREIGN KEY ([assessor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_monitoring_completed_by] FOREIGN KEY ([completed_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [FK_expert_monitoring_cancelled_by] FOREIGN KEY ([cancelled_by]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION
        );

        CREATE NONCLUSTERED INDEX [IX_expert_monitoring_expert_status_date]
            ON [dbo].[expert_monitoring_records]([expert_id], [status], [planned_date]);
        CREATE NONCLUSTERED INDEX [IX_expert_monitoring_competency]
            ON [dbo].[expert_monitoring_records]([competency_id]);
        CREATE NONCLUSTERED INDEX [IX_expert_monitoring_method_performed]
            ON [dbo].[expert_monitoring_records]([monitoring_method], [performed_date]);
        CREATE NONCLUSTERED INDEX [IX_expert_monitoring_audit_plan]
            ON [dbo].[expert_monitoring_records]([audit_plan_id]);
        CREATE NONCLUSTERED INDEX [IX_expert_monitoring_result]
            ON [dbo].[expert_monitoring_records]([result]);
        CREATE NONCLUSTERED INDEX [IX_expert_monitoring_created_by]
            ON [dbo].[expert_monitoring_records]([created_by]);
    END;

    IF OBJECT_ID(N'[dbo].[expert_witness_assessment_items]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[expert_witness_assessment_items] (
            [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_expert_witness_item_id] DEFAULT NEWID(),
            [monitoring_id] UNIQUEIDENTIFIER NOT NULL,
            [criterion_code] NVARCHAR(60) NOT NULL,
            [criterion_label] NVARCHAR(500) NOT NULL,
            [rating] NVARCHAR(5) NOT NULL,
            [comment] NVARCHAR(MAX) NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_expert_witness_item_created_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_expert_witness_assessment_items] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [CK_expert_witness_rating] CHECK ([rating] IN (N'4', N'3', N'2', N'1', N'N')),
            CONSTRAINT [FK_expert_witness_monitoring] FOREIGN KEY ([monitoring_id]) REFERENCES [dbo].[expert_monitoring_records]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION,
            CONSTRAINT [UQ_expert_witness_monitoring_criterion] UNIQUE ([monitoring_id], [criterion_code])
        );
        CREATE NONCLUSTERED INDEX [IX_expert_witness_monitoring]
            ON [dbo].[expert_witness_assessment_items]([monitoring_id]);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

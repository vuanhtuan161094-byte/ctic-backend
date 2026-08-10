BEGIN TRY
    BEGIN TRANSACTION;

    IF OBJECT_ID(N'[dbo].[audit_program_manday_requirements]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[audit_program_manday_requirements] (
            [id] UNIQUEIDENTIFIER NOT NULL,
            [appointment_id] UNIQUEIDENTIFIER NOT NULL,
            [program_key] NVARCHAR(200) NOT NULL,
            [management_system] NVARCHAR(30) NOT NULL,
            [standard_code] NVARCHAR(100) NOT NULL,
            [pre_ims_mandays] DECIMAL(10,2) NOT NULL CONSTRAINT [DF_audit_program_manday_requirements_pre_ims] DEFAULT 0,
            [required_units] INT NOT NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_audit_program_manday_requirements_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_audit_program_manday_requirements_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_audit_program_manday_requirements] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [UQ_audit_program_manday_requirement] UNIQUE ([appointment_id], [program_key]),
            CONSTRAINT [CK_audit_program_manday_requirements_units] CHECK ([required_units] >= 1),
            CONSTRAINT [CK_audit_program_manday_requirements_pre_ims] CHECK ([pre_ims_mandays] >= 0),
            CONSTRAINT [FK_audit_program_manday_requirements_appointment]
                FOREIGN KEY ([appointment_id]) REFERENCES [dbo].[audit_team_appointments]([id])
        );
        CREATE INDEX [IX_audit_program_manday_requirement_appointment]
            ON [dbo].[audit_program_manday_requirements]([appointment_id]);
    END;

    IF OBJECT_ID(N'[dbo].[audit_member_program_mandays]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[audit_member_program_mandays] (
            [id] UNIQUEIDENTIFIER NOT NULL,
            [appointment_id] UNIQUEIDENTIFIER NOT NULL,
            [member_id] UNIQUEIDENTIFIER NOT NULL,
            [program_key] NVARCHAR(200) NOT NULL,
            [management_system] NVARCHAR(30) NOT NULL,
            [standard_code] NVARCHAR(100) NOT NULL,
            [manday_units] INT NOT NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_audit_member_program_mandays_created_at] DEFAULT SYSUTCDATETIME(),
            [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_audit_member_program_mandays_updated_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_audit_member_program_mandays] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [UQ_audit_member_program_manday] UNIQUE ([member_id], [program_key]),
            CONSTRAINT [CK_audit_member_program_mandays_units] CHECK ([manday_units] >= 0),
            CONSTRAINT [FK_audit_member_program_mandays_appointment]
                FOREIGN KEY ([appointment_id]) REFERENCES [dbo].[audit_team_appointments]([id]),
            CONSTRAINT [FK_audit_member_program_mandays_member]
                FOREIGN KEY ([member_id]) REFERENCES [dbo].[audit_team_members]([id])
        );
        CREATE INDEX [IX_audit_member_program_manday_appointment]
            ON [dbo].[audit_member_program_mandays]([appointment_id]);
        CREATE INDEX [IX_audit_member_program_manday_member]
            ON [dbo].[audit_member_program_mandays]([member_id]);
        CREATE INDEX [IX_audit_member_program_manday_program]
            ON [dbo].[audit_member_program_mandays]([program_key]);
    END;

    IF OBJECT_ID(N'[dbo].[audit_manday_allocation_versions]', N'U') IS NULL
    BEGIN
        CREATE TABLE [dbo].[audit_manday_allocation_versions] (
            [id] UNIQUEIDENTIFIER NOT NULL,
            [appointment_id] UNIQUEIDENTIFIER NOT NULL,
            [version_no] INT NOT NULL,
            [calculation_version] NVARCHAR(50) NOT NULL,
            [stage1_units] INT NOT NULL,
            [stage2_units] INT NOT NULL,
            [allocation_mode] NVARCHAR(30) NOT NULL,
            [before_json] NVARCHAR(MAX) NULL,
            [after_json] NVARCHAR(MAX) NOT NULL,
            [change_reason] NVARCHAR(MAX) NULL,
            [created_by] UNIQUEIDENTIFIER NOT NULL,
            [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_audit_manday_allocation_versions_created_at] DEFAULT SYSUTCDATETIME(),
            CONSTRAINT [PK_audit_manday_allocation_versions] PRIMARY KEY CLUSTERED ([id]),
            CONSTRAINT [UQ_audit_manday_allocation_version] UNIQUE ([appointment_id], [version_no]),
            CONSTRAINT [CK_audit_manday_allocation_versions_version] CHECK ([version_no] >= 1),
            CONSTRAINT [CK_audit_manday_allocation_versions_units] CHECK ([stage1_units] >= 0 AND [stage2_units] >= 0),
            CONSTRAINT [CK_audit_manday_allocation_versions_mode] CHECK ([allocation_mode] IN (N'AUTO', N'MANUAL_OVERRIDE')),
            CONSTRAINT [FK_audit_manday_allocation_versions_appointment]
                FOREIGN KEY ([appointment_id]) REFERENCES [dbo].[audit_team_appointments]([id]),
            CONSTRAINT [FK_audit_manday_allocation_versions_created_by]
                FOREIGN KEY ([created_by]) REFERENCES [dbo].[users]([id])
        );
        CREATE INDEX [IX_audit_manday_allocation_version_appointment]
            ON [dbo].[audit_manday_allocation_versions]([appointment_id], [created_at]);
        CREATE INDEX [IX_audit_manday_allocation_version_created_by]
            ON [dbo].[audit_manday_allocation_versions]([created_by]);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;

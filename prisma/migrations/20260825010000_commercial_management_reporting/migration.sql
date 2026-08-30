ALTER TABLE [contracts] ADD
    [quotation_id] UNIQUEIDENTIFIER NULL,
    [commercial_status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_contracts_commercial_status] DEFAULT N'DRAFT',
    [payment_terms] NVARCHAR(1000) NULL,
    [renewal_date] DATE NULL,
    [sales_owner_id] UNIQUEIDENTIFIER NULL,
    [commercial_note] NVARCHAR(MAX) NULL;

CREATE TABLE [quotations] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_quotations_id] DEFAULT NEWID(),
    [quotation_number] NVARCHAR(50) NOT NULL,
    [version_no] INT NOT NULL CONSTRAINT [DF_quotations_version_no] DEFAULT 1,
    [previous_version_id] UNIQUEIDENTIFIER NULL,
    [customer_id] UNIQUEIDENTIFIER NOT NULL,
    [application_id] UNIQUEIDENTIFIER NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [scheme_id] UNIQUEIDENTIFIER NULL,
    [quotation_date] DATE NOT NULL,
    [validity_date] DATE NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [technical_approved_mandays] DECIMAL(10,2) NULL,
    [subtotal_amount] DECIMAL(19,4) NOT NULL,
    [discount_amount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_quotations_discount] DEFAULT 0,
    [tax_amount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_quotations_tax] DEFAULT 0,
    [total_amount] DECIMAL(19,4) NOT NULL,
    [commercial_notes] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_quotations_status] DEFAULT N'DRAFT',
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [approved_by] UNIQUEIDENTIFIER NULL,
    [approved_at] DATETIME2 NULL,
    [sent_at] DATETIME2 NULL,
    [accepted_at] DATETIME2 NULL,
    [rejected_at] DATETIME2 NULL,
    [cancelled_at] DATETIME2 NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_quotations_created_at] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_quotations_updated_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_quotations] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_quotations_number_version] UNIQUE ([quotation_number], [version_no]),
    CONSTRAINT [FK_quotations_previous] FOREIGN KEY ([previous_version_id]) REFERENCES [quotations]([id]),
    CONSTRAINT [FK_quotations_customer] FOREIGN KEY ([customer_id]) REFERENCES [customers]([id]),
    CONSTRAINT [FK_quotations_application] FOREIGN KEY ([application_id]) REFERENCES [certification_applications]([id]),
    CONSTRAINT [FK_quotations_project] FOREIGN KEY ([project_id]) REFERENCES [certification_projects]([id]),
    CONSTRAINT [FK_quotations_scheme] FOREIGN KEY ([scheme_id]) REFERENCES [certification_schemes]([id])
);

CREATE TABLE [quotation_line_items] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_quotation_lines_id] DEFAULT NEWID(),
    [quotation_id] UNIQUEIDENTIFIER NOT NULL,
    [line_no] INT NOT NULL,
    [description] NVARCHAR(1000) NOT NULL,
    [quantity] DECIMAL(18,4) NOT NULL,
    [unit_price] DECIMAL(19,4) NOT NULL,
    [line_total] DECIMAL(19,4) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_quotation_lines_created_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_quotation_line_items] PRIMARY KEY ([id]),
    CONSTRAINT [UQ_quotation_lines_quotation_line] UNIQUE ([quotation_id], [line_no]),
    CONSTRAINT [FK_quotation_lines_quotation] FOREIGN KEY ([quotation_id]) REFERENCES [quotations]([id]) ON DELETE CASCADE
);

CREATE TABLE [billing_milestones] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_billing_milestones_id] DEFAULT NEWID(),
    [contract_id] UNIQUEIDENTIFIER NOT NULL,
    [project_id] UNIQUEIDENTIFIER NULL,
    [milestone_type] NVARCHAR(50) NOT NULL,
    [milestone_name] NVARCHAR(255) NOT NULL,
    [planned_amount] DECIMAL(19,4) NOT NULL,
    [currency] NVARCHAR(3) NOT NULL,
    [planned_date] DATE NULL,
    [invoice_reference] NVARCHAR(100) NULL,
    [invoice_date] DATE NULL,
    [paid_amount] DECIMAL(19,4) NOT NULL CONSTRAINT [DF_billing_milestones_paid] DEFAULT 0,
    [paid_date] DATE NULL,
    [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_billing_milestones_status] DEFAULT N'PLANNED',
    [note] NVARCHAR(1000) NULL,
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [updated_by] UNIQUEIDENTIFIER NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_billing_milestones_created_at] DEFAULT SYSUTCDATETIME(),
    [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_billing_milestones_updated_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_billing_milestones] PRIMARY KEY ([id]),
    CONSTRAINT [CK_billing_milestones_amounts] CHECK ([planned_amount] >= 0 AND [paid_amount] >= 0 AND [paid_amount] <= [planned_amount]),
    CONSTRAINT [FK_billing_milestones_contract] FOREIGN KEY ([contract_id]) REFERENCES [contracts]([id]),
    CONSTRAINT [FK_billing_milestones_project] FOREIGN KEY ([project_id]) REFERENCES [certification_projects]([id])
);

CREATE TABLE [billing_milestone_actions] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_billing_actions_id] DEFAULT NEWID(),
    [billing_milestone_id] UNIQUEIDENTIFIER NOT NULL,
    [action] NVARCHAR(50) NOT NULL,
    [from_status] NVARCHAR(30) NULL,
    [to_status] NVARCHAR(30) NOT NULL,
    [snapshot_json] NVARCHAR(MAX) NOT NULL,
    [actor_id] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_billing_actions_created_at] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_billing_milestone_actions] PRIMARY KEY ([id]),
    CONSTRAINT [FK_billing_actions_milestone] FOREIGN KEY ([billing_milestone_id]) REFERENCES [billing_milestones]([id])
);

EXEC(N'CREATE UNIQUE INDEX [UQ_contracts_quotation] ON [contracts]([quotation_id]) WHERE [quotation_id] IS NOT NULL');
EXEC(N'CREATE INDEX [IX_contracts_commercial_status_sign_date] ON [contracts]([commercial_status], [sign_date])');
EXEC(N'CREATE INDEX [IX_contracts_renewal_date] ON [contracts]([renewal_date])');
CREATE INDEX [IX_quotations_customer_status_date] ON [quotations]([customer_id], [status], [quotation_date]);
CREATE INDEX [IX_quotations_project_status] ON [quotations]([project_id], [status]);
CREATE INDEX [IX_quotations_scheme_status] ON [quotations]([scheme_id], [status]);
CREATE INDEX [IX_quotations_previous_version] ON [quotations]([previous_version_id]);
CREATE INDEX [IX_quotation_lines_quotation] ON [quotation_line_items]([quotation_id]);
CREATE INDEX [IX_billing_milestones_contract_status_date] ON [billing_milestones]([contract_id], [status], [planned_date]);
CREATE INDEX [IX_billing_milestones_project_status] ON [billing_milestones]([project_id], [status]);
CREATE INDEX [IX_billing_milestones_currency_status] ON [billing_milestones]([currency], [status]);
CREATE INDEX [IX_billing_actions_milestone_created] ON [billing_milestone_actions]([billing_milestone_id], [created_at]);

EXEC(N'ALTER TABLE [contracts] ADD CONSTRAINT [FK_contracts_quotation]
    FOREIGN KEY ([quotation_id]) REFERENCES [quotations]([id])');

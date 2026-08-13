BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[customers]
ADD [country_code] NVARCHAR(2) NOT NULL
    CONSTRAINT [DF_customers_country_code] DEFAULT N'VN';

ALTER TABLE [dbo].[application_review_capability_snapshots]
ADD [approval_version] INT NOT NULL
    CONSTRAINT [DF_application_review_capability_snapshots_approval_version] DEFAULT 1;

DROP INDEX [UQ_application_review_capability_snapshot_pair]
ON [dbo].[application_review_capability_snapshots];

CREATE UNIQUE NONCLUSTERED INDEX [UQ_application_review_capability_snapshot_version_pair]
ON [dbo].[application_review_capability_snapshots]
(
    [review_id],
    [approval_version],
    [program_code],
    [iaf_code]
);

CREATE NONCLUSTERED INDEX [IX_application_review_capability_snapshot_review_version]
ON [dbo].[application_review_capability_snapshots]
(
    [review_id],
    [approval_version]
);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;

THROW;

END CATCH;

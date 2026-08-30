/* Step 9C V2 - SQL Server repair-safe / idempotent migration 32.
   Links certification-body capability to an exact standard edition.

   IMPORTANT SQL Server detail:
   DDL that references a column added earlier in the same batch may be
   compiled before that column exists, causing error 207 (Invalid column name).
   Therefore statements that reference standard_edition_id are executed via
   dynamic SQL so they compile only after the column exists.
*/

IF COL_LENGTH(N'dbo.certification_body_capabilities', N'standard_edition_id') IS NULL
BEGIN
    EXEC(N'
        ALTER TABLE [dbo].[certification_body_capabilities]
        ADD [standard_edition_id] UNIQUEIDENTIFIER NULL;
    ');
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE [name] = N'FK_certification_body_capabilities_standard_edition'
      AND [parent_object_id] = OBJECT_ID(N'dbo.certification_body_capabilities')
)
BEGIN
    EXEC(N'
        ALTER TABLE [dbo].[certification_body_capabilities]
        ADD CONSTRAINT [FK_certification_body_capabilities_standard_edition]
        FOREIGN KEY ([standard_edition_id]) REFERENCES [dbo].[standard_editions]([id])
        ON DELETE NO ACTION ON UPDATE NO ACTION;
    ');
END;

IF EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'UQ_certification_body_capability_program_iaf'
      AND [object_id] = OBJECT_ID(N'dbo.certification_body_capabilities')
)
BEGIN
    DROP INDEX [UQ_certification_body_capability_program_iaf]
    ON [dbo].[certification_body_capabilities];
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'UQ_cb_capability_standard_iaf'
      AND [object_id] = OBJECT_ID(N'dbo.certification_body_capabilities')
)
BEGIN
    EXEC(N'
        CREATE UNIQUE INDEX [UQ_cb_capability_standard_iaf]
        ON [dbo].[certification_body_capabilities]([standard_edition_id], [iaf_scope_id])
        WHERE [standard_edition_id] IS NOT NULL;
    ');
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'UQ_cb_capability_legacy_program_iaf'
      AND [object_id] = OBJECT_ID(N'dbo.certification_body_capabilities')
)
BEGIN
    EXEC(N'
        CREATE UNIQUE INDEX [UQ_cb_capability_legacy_program_iaf]
        ON [dbo].[certification_body_capabilities]([program_code], [iaf_scope_id])
        WHERE [standard_edition_id] IS NULL;
    ');
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE [name] = N'IX_certification_body_capability_standard_iaf'
      AND [object_id] = OBJECT_ID(N'dbo.certification_body_capabilities')
)
BEGIN
    EXEC(N'
        CREATE INDEX [IX_certification_body_capability_standard_iaf]
        ON [dbo].[certification_body_capabilities]([standard_edition_id], [iaf_scope_id]);
    ');
END;

-- Preserve all legacy audit actions and accept the governed submission workflow.
-- Scope: this CHECK constraint only; no business data or table structure changes.
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF NOT EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE [name] = N'CK_expert_competency_action_type'
          AND [parent_object_id] = OBJECT_ID(N'[dbo].[expert_competency_actions]')
    )
        THROW 51000, 'Expected competency audit action constraint is missing.', 1;

    IF EXISTS (
        SELECT 1 FROM [dbo].[expert_competency_actions]
        WHERE [action_type] NOT IN (
            N'BASELINE', N'CREATE', N'UPDATE_DRAFT', N'UPDATE',
            N'SUBMIT', N'RETURN', N'APPROVE', N'SUSPEND',
            N'REACTIVATE', N'RENEW', N'REVIEW_RECORDED',
            N'EVIDENCE_ADDED', N'EVIDENCE_VOIDED'
        )
    )
        THROW 51001, 'Existing competency audit action is outside the reviewed allowed set.', 1;

    ALTER TABLE [dbo].[expert_competency_actions]
        DROP CONSTRAINT [CK_expert_competency_action_type];

    ALTER TABLE [dbo].[expert_competency_actions] WITH CHECK
        ADD CONSTRAINT [CK_expert_competency_action_type] CHECK ([action_type] IN (
            N'BASELINE', N'CREATE', N'UPDATE_DRAFT', N'UPDATE',
            N'SUBMIT', N'RETURN', N'APPROVE', N'SUSPEND',
            N'REACTIVATE', N'RENEW', N'REVIEW_RECORDED',
            N'EVIDENCE_ADDED', N'EVIDENCE_VOIDED'
        ));

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;


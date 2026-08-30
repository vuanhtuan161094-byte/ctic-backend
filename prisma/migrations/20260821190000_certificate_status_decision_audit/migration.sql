ALTER TABLE [dbo].[certificate_status_histories]
ADD [certification_decision_id] UNIQUEIDENTIFIER NULL;

CREATE NONCLUSTERED INDEX [IX_certificate_status_histories_decision]
ON [dbo].[certificate_status_histories]([certification_decision_id]);

ALTER TABLE [dbo].[certificate_status_histories]
ADD CONSTRAINT [FK_certificate_status_histories_decision]
FOREIGN KEY ([certification_decision_id])
REFERENCES [dbo].[certification_decisions]([id])
ON DELETE NO ACTION
ON UPDATE NO ACTION;

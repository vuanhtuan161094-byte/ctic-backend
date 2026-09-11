import { Module } from '@nestjs/common';

import { DocumentFilesModule } from '../document-files/document-files.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AuditDocumentsController } from './audit-documents.controller';
import { AuditDocumentsService } from './audit-documents.service';
import { AuditDocumentQueryContextService } from './audit-document-query-context.service';

@Module({
    imports: [
        PrismaModule,
        DocumentFilesModule,
    ],
    controllers: [
        AuditDocumentsController,
    ],
    providers: [
        AuditDocumentsService,
        AuditDocumentQueryContextService,
    ],
    exports: [
        AuditDocumentsService,
    ],
})
export class AuditDocumentsModule { }

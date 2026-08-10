import { Module } from '@nestjs/common';

import { DocumentFilesModule } from '../document-files/document-files.module';
import { PrismaModule } from '../prisma/prisma.module';

import { AuditDocumentsController } from './audit-documents.controller';
import { AuditDocumentsService } from './audit-documents.service';

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
    ],
    exports: [
        AuditDocumentsService,
    ],
})
export class AuditDocumentsModule { }

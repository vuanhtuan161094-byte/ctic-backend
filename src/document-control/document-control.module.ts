import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { DocumentFilesModule } from '../document-files/document-files.module';
import { DocumentControlController } from './document-control.controller';
import { DocumentControlV2Controller } from './document-control-v2.controller';
import { DocumentLibraryService } from './document-library.service';
import { TemplateManagerService } from './template-manager.service';
import { DocumentControlService } from './document-control.service';

@Module({
    imports: [PrismaModule, SecurityModule, DocumentFilesModule],
    controllers: [DocumentControlController, DocumentControlV2Controller],
    providers: [DocumentControlService, DocumentLibraryService, TemplateManagerService],
    exports: [DocumentControlService],
})
export class DocumentControlModule {}

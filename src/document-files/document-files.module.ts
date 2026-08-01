import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { DocumentFilesController } from './document-files.controller';
import { DocumentFilesService } from './document-files.service';

@Module({
    imports: [
        PrismaModule,
    ],

    controllers: [
        DocumentFilesController,
    ],

    providers: [
        DocumentFilesService,
    ],

    exports: [
        DocumentFilesService,
    ],
})
export class DocumentFilesModule { }
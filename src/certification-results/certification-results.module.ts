import { Module } from '@nestjs/common';

import { DocumentFilesModule } from '../document-files/document-files.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CertificationResultsController } from './certification-results.controller';
import { CertificationResultsService } from './certification-results.service';

@Module({
    imports: [
        PrismaModule,
        DocumentFilesModule,
    ],
    controllers: [CertificationResultsController],
    providers: [CertificationResultsService],
    exports: [CertificationResultsService],
})
export class CertificationResultsModule { }

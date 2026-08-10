import { Module } from '@nestjs/common';

import { DocumentFilesModule } from '../document-files/document-files.module';
import { PrismaModule } from '../prisma/prisma.module';

import { ReportDocumentsService } from './report-documents.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
    imports: [PrismaModule, DocumentFilesModule],
    controllers: [ReportsController],
    providers: [ReportsService, ReportDocumentsService],
    exports: [ReportsService],
})
export class ReportsModule { }
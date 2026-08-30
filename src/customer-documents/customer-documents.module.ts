import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import { CustomerDocumentsPortalController } from './customer-documents.portal.controller';
import { CustomerDocumentRequestsController } from './customer-document-requests.controller';
import { CustomerDocumentsService } from './customer-documents.service';

@Module({
    imports: [PrismaModule, WorkItemsModule],
    controllers: [CustomerDocumentsPortalController, CustomerDocumentRequestsController],
    providers: [CustomerDocumentsService],
})
export class CustomerDocumentsModule {}

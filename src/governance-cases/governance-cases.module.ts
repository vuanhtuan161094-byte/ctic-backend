import { Module } from '@nestjs/common';

import { DocumentControlModule } from '../document-control/document-control.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { WorkItemsModule } from '../work-items/work-items.module';
import { GovernanceCasesController } from './governance-cases.controller';
import { GovernanceCasesPortalController } from './governance-cases.portal.controller';
import { GovernanceCasesService } from './governance-cases.service';

@Module({
    imports: [PrismaModule, SecurityModule, WorkItemsModule, DocumentControlModule],
    controllers: [GovernanceCasesController, GovernanceCasesPortalController],
    providers: [GovernanceCasesService],
    exports: [GovernanceCasesService],
})
export class GovernanceCasesModule {}

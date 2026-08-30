import {
    Module,
} from '@nestjs/common';

import {
    CertificationApplicationsModule,
} from '../certification-applications/certification-applications.module';
import {
    PrismaModule,
} from '../prisma/prisma.module';
import {
    WorkItemsModule,
} from '../work-items/work-items.module';
import {
    CustomerPortalController,
} from './customer-portal.controller';
import {
    CustomerPortalService,
} from './customer-portal.service';
import {
    CustomerOrganizationChangeReviewController,
} from './customer-organization-change-review.controller';
import {
    CustomerUserAccessReviewController,
} from './customer-user-access-review.controller';

@Module({
    imports: [
        PrismaModule,
        CertificationApplicationsModule,
        WorkItemsModule,
    ],
    controllers: [
        CustomerPortalController,
        CustomerOrganizationChangeReviewController,
        CustomerUserAccessReviewController,
    ],
    providers: [
        CustomerPortalService,
    ],
})
export class CustomerPortalModule { }

import {
    Global,
    Module,
} from '@nestjs/common';

import {
    PrismaModule,
} from '../prisma/prisma.module';
import {
    NotificationsModule,
} from '../notifications/notifications.module';
import {
    SecurityModule,
} from '../security/security.module';
import {
    ActionAuthorizationService,
} from './action-authorization.service';
import {
    WorkItemsController,
} from './work-items.controller';
import {
    WorkItemsService,
} from './work-items.service';

@Global()
@Module({
    imports: [
        PrismaModule,
        SecurityModule,
        NotificationsModule,
    ],
    controllers: [
        WorkItemsController,
    ],
    providers: [
        ActionAuthorizationService,
        WorkItemsService,
    ],
    exports: [
        ActionAuthorizationService,
        WorkItemsService,
    ],
})
export class WorkItemsModule { }

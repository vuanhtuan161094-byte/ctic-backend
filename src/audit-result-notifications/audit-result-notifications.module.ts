import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AuditResultNotificationsController } from './audit-result-notifications.controller';
import { AuditResultNotificationsService } from './audit-result-notifications.service';

@Module({
    imports: [
        PrismaModule,
    ],

    controllers: [
        AuditResultNotificationsController,
    ],

    providers: [
        AuditResultNotificationsService,
    ],

    exports: [
        AuditResultNotificationsService,
    ],
})
export class AuditResultNotificationsModule { }
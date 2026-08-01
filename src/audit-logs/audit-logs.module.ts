import {
    Module,
} from '@nestjs/common';

import {
    APP_INTERCEPTOR,
} from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';

import { AuditLoggingInterceptor } from './audit-logging.interceptor';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';

@Module({
    imports: [
        AuthModule,
    ],

    controllers: [
        AuditLogsController,
    ],

    providers: [
        AuditLogsService,

        {
            provide:
                APP_INTERCEPTOR,

            useClass:
                AuditLoggingInterceptor,
        },
    ],

    exports: [
        AuditLogsService,
    ],
})
export class AuditLogsModule { }
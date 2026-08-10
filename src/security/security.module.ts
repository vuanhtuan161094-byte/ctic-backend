import {
    Global,
    Module,
} from '@nestjs/common';

import {
    PrismaModule,
} from '../prisma/prisma.module';

import {
    PublicRegistrationGuard,
} from './public-registration.guard';
import {
    ResourceAccessService,
} from './resource-access.service';
import {
    SecurityAuditService,
} from './security-audit.service';
import {
    SecurityRateLimitGuard,
} from './security-rate-limit.guard';
import {
    SecurityRateLimitService,
} from './security-rate-limit.service';

@Global()
@Module({
    imports: [
        PrismaModule,
    ],
    providers: [
        SecurityRateLimitService,
        SecurityRateLimitGuard,
        PublicRegistrationGuard,
        SecurityAuditService,
        ResourceAccessService,
    ],
    exports: [
        SecurityRateLimitService,
        SecurityRateLimitGuard,
        PublicRegistrationGuard,
        SecurityAuditService,
        ResourceAccessService,
    ],
})
export class SecurityModule { }

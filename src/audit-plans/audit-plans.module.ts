import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AuditPlansController } from './audit-plans.controller';
import { AuditPlansService } from './audit-plans.service';

@Module({
    imports: [PrismaModule],
    controllers: [AuditPlansController],
    providers: [AuditPlansService],
    exports: [AuditPlansService],
})
export class AuditPlansModule { }
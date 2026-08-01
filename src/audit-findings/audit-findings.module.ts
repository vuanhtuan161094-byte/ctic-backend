import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AuditFindingsController } from './audit-findings.controller';
import { AuditFindingsService } from './audit-findings.service';

@Module({
  imports: [
    PrismaModule,
  ],

  controllers: [
    AuditFindingsController,
  ],

  providers: [
    AuditFindingsService,
  ],

  exports: [
    AuditFindingsService,
  ],
})
export class AuditFindingsModule { }
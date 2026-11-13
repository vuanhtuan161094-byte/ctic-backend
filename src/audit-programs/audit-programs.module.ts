import { Module } from '@nestjs/common';

import { AuditProgramsController } from './audit-programs.controller';
import { AuditProgramsService } from './audit-programs.service';
import { P09Gs1ExceptionService } from './p09-gs1-exception.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuditProgramsController],
  providers: [AuditProgramsService, P09Gs1ExceptionService],
  exports: [AuditProgramsService],
})
export class AuditProgramsModule { }
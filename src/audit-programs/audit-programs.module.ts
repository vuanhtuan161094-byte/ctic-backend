import { Module } from '@nestjs/common';

import { AuditProgramsController } from './audit-programs.controller';
import { AuditProgramsService } from './audit-programs.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuditProgramsController],
  providers: [AuditProgramsService],
  exports: [AuditProgramsService],
})
export class AuditProgramsModule { }
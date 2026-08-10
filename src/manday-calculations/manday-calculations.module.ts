import { Module } from '@nestjs/common';

import { MandayCalculationsService } from './manday-calculations.service';
import { MandayCalculationsController } from './manday-calculations.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MandayRulesService } from './manday-rules.service';

@Module({
  imports: [PrismaModule],
  controllers: [MandayCalculationsController],
  providers: [MandayCalculationsService, MandayRulesService],
  exports: [MandayCalculationsService, MandayRulesService],
})
export class MandayCalculationsModule { }
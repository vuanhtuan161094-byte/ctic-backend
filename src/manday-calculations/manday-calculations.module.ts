import { Module } from '@nestjs/common';

import { MandayCalculationsService } from './manday-calculations.service';
import { MandayCalculationsController } from './manday-calculations.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MandayCalculationsController],
  providers: [MandayCalculationsService],
  exports: [MandayCalculationsService],
})
export class MandayCalculationsModule { }
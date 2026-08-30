import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { MandayCalculationsModule } from '../manday-calculations/manday-calculations.module';
import { SurveillanceInformationController } from './surveillance-information.controller';
import { SurveillanceInformationService } from './surveillance-information.service';

@Module({
    imports: [PrismaModule, SecurityModule, MandayCalculationsModule],
    controllers: [SurveillanceInformationController],
    providers: [SurveillanceInformationService],
    exports: [SurveillanceInformationService],
})
export class SurveillanceInformationModule { }

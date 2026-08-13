import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CertificationBodyCapabilitiesController } from './certification-body-capabilities.controller';
import { CertificationBodyCapabilitiesService } from './certification-body-capabilities.service';

@Module({
    imports: [PrismaModule],
    controllers: [CertificationBodyCapabilitiesController],
    providers: [CertificationBodyCapabilitiesService],
    exports: [CertificationBodyCapabilitiesService],
})
export class CertificationBodyCapabilitiesModule { }

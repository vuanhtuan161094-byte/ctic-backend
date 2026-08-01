import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { CertificationDecisionsController } from './certification-decisions.controller';
import { CertificationDecisionsService } from './certification-decisions.service';

@Module({
    imports: [
        PrismaModule,
    ],

    controllers: [
        CertificationDecisionsController,
    ],

    providers: [
        CertificationDecisionsService,
    ],

    exports: [
        CertificationDecisionsService,
    ],
})
export class CertificationDecisionsModule { }
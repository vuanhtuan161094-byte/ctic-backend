import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { CertificationResultsModule } from '../certification-results/certification-results.module';
import { TechnicalReviewsModule } from '../technical-reviews/technical-reviews.module';
import { DecisionWorkspaceController } from './decision-workspace.controller';

import { CertificationDecisionsController } from './certification-decisions.controller';
import { CertificationDecisionsService } from './certification-decisions.service';

@Module({
    imports: [
        PrismaModule,
        CertificationResultsModule,
        TechnicalReviewsModule,
    ],

    controllers: [
        CertificationDecisionsController,
        DecisionWorkspaceController,
    ],

    providers: [
        CertificationDecisionsService,
    ],

    exports: [
        CertificationDecisionsService,
    ],
})
export class CertificationDecisionsModule { }

import { Module } from '@nestjs/common';

import { ApplicationReviewsController } from './application-reviews.controller';
import { ApplicationReviewsService } from './application-reviews.service';

import { PrismaModule } from '../prisma/prisma.module';
import { CertificationBodyCapabilitiesModule } from '../certification-body-capabilities/certification-body-capabilities.module';


@Module({
  imports: [
    PrismaModule,
    CertificationBodyCapabilitiesModule,
  ],
  controllers: [
    ApplicationReviewsController,
  ],
  providers: [
    ApplicationReviewsService,
  ],
  exports: [
    ApplicationReviewsService,
  ],
})
export class ApplicationReviewsModule { }

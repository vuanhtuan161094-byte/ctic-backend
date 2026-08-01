import { Module } from '@nestjs/common';

import { ApplicationReviewsController } from './application-reviews.controller';
import { ApplicationReviewsService } from './application-reviews.service';

import { PrismaModule } from '../prisma/prisma.module';


@Module({
  imports: [
    PrismaModule,
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
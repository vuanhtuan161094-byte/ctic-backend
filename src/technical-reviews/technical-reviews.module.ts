import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { TechnicalReviewsController } from './technical-reviews.controller';
import { TechnicalReviewsService } from './technical-reviews.service';

@Module({
  imports: [
    PrismaModule,
  ],

  controllers: [
    TechnicalReviewsController,
  ],

  providers: [
    TechnicalReviewsService,
  ],

  exports: [
    TechnicalReviewsService,
  ],
})
export class TechnicalReviewsModule { }
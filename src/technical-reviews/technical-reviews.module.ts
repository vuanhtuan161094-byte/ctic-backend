import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuditDocumentsModule } from '../audit-documents/audit-documents.module';

import { TechnicalReviewsController } from './technical-reviews.controller';
import { TechnicalReviewsService } from './technical-reviews.service';

@Module({
  imports: [
    PrismaModule,
    AuditDocumentsModule,
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
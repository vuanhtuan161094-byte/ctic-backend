import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { AuditDocumentsModule } from '../audit-documents/audit-documents.module';
import { DelegationsModule } from '../delegations/delegations.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { TechnicalReviewsController } from './technical-reviews.controller';
import { TechnicalReviewsService } from './technical-reviews.service';
import { TechnicalReviewReviewerPolicyService } from './technical-review-reviewer-policy.service';
import { TechnicalReviewQueryContextService } from './technical-review-query-context.service';

@Module({
  imports: [
    PrismaModule,
    AuditDocumentsModule,
    DelegationsModule,
    NotificationsModule,
  ],

  controllers: [
    TechnicalReviewsController,
  ],

  providers: [
    TechnicalReviewsService,
    TechnicalReviewReviewerPolicyService,
    TechnicalReviewQueryContextService,
  ],

  exports: [
    TechnicalReviewsService,
  ],
})
export class TechnicalReviewsModule { }

import {
  Global,
  Module,
} from '@nestjs/common';

import { NotificationEngineService } from './notification-engine.service';
import { NotificationRecipientService } from './notification-recipient.service';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  controllers: [
    NotificationsController,
  ],

  providers: [
    NotificationRecipientService,
    NotificationEngineService,
    NotificationSchedulerService,
    NotificationsService,
  ],

  exports: [
    NotificationEngineService,
    NotificationSchedulerService,
    NotificationsService,
  ],
})
export class NotificationsModule { }

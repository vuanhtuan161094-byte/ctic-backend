import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SystemAdministrationController } from './system-administration.controller';
import { SystemAdministrationService } from './system-administration.service';

@Module({
    imports: [AuthModule, NotificationsModule],
    controllers: [SystemAdministrationController],
    providers: [SystemAdministrationService],
})
export class SystemAdministrationModule {}

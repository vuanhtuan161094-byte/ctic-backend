import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DelegationsController } from './delegations.controller';
import { DelegationsService } from './delegations.service';

@Global()
@Module({
    imports: [PrismaModule, NotificationsModule],
    controllers: [DelegationsController],
    providers: [DelegationsService],
    exports: [DelegationsService],
})
export class DelegationsModule {}

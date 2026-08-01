import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({

  // Cho phép dùng PrismaService trong module này
  imports: [PrismaModule],

  // Khai báo controller
  controllers: [CustomersController],

  // Khai báo service
  providers: [CustomersService],
})
export class CustomersModule { }
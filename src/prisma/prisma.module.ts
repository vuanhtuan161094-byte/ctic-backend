import {
  Global,
  Module,
} from '@nestjs/common';

import {
  ConfigModule,
} from '@nestjs/config';

import {
  PrismaService,
} from './prisma.service';

import {
  DatabaseSchemaService,
} from './database-schema.service';

@Global()
@Module({
  imports: [
    ConfigModule,
  ],

  providers: [
    PrismaService,
    DatabaseSchemaService,
  ],

  exports: [
    PrismaService,
    DatabaseSchemaService,
  ],
})
export class PrismaModule { }
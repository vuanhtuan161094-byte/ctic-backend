import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
} from '@nestjs/common';

import {
    ConfigService,
} from '@nestjs/config';

import {
    PrismaMssql,
} from '@prisma/adapter-mssql';

import {
    PrismaClient,
} from '@prisma/client';

@Injectable()
export class PrismaService
    extends PrismaClient
    implements
    OnModuleInit,
    OnModuleDestroy {
    constructor(
        configService:
            ConfigService,
    ) {
        const databaseUrl =
            configService.get<string>(
                'DATABASE_URL',
            );

        if (!databaseUrl) {
            throw new Error(
                'Thiếu biến môi trường DATABASE_URL',
            );
        }

        const adapter =
            new PrismaMssql(
                databaseUrl,
            );

        super({
            adapter,
        });
    }

    async onModuleInit():
        Promise<void> {
        await this.$connect();

        console.log(
            'Prisma connected',
        );
    }

    async onModuleDestroy():
        Promise<void> {
        await this.$disconnect();
    }
}
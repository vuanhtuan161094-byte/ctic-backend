import {
  Module,
} from '@nestjs/common';

import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';

import {
  JwtModule,
} from '@nestjs/jwt';

import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy/jwt.strategy';
import { PermissionsGuard } from './permissions.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    PrismaModule,
    SecurityModule,
    ConfigModule,

    JwtModule.registerAsync({
      imports: [
        ConfigModule,
      ],

      inject: [
        ConfigService,
      ],

      useFactory: (
        configService:
          ConfigService,
      ) => {
        const configuredTtl =
          Number(
            configService.get<string>(
              'JWT_ACCESS_TTL_SECONDS',
            ) ??
            '28800',
          );

        const expiresIn =
          Number.isInteger(
            configuredTtl,
          ) &&
          configuredTtl >= 300 &&
          configuredTtl <= 86400
            ? configuredTtl
            : 28800;

        return {
          secret:
            configService.get<string>(
              'JWT_SECRET',
            ),

          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard,
    PermissionsGuard,
  ],

  exports: [
    RolesGuard,
    PermissionsGuard,
  ],
})
export class AuthModule { }
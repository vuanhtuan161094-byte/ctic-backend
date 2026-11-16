import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentFilesModule } from '../document-files/document-files.module';
import { P09F16Controller } from './p09-f16.controller';
import { P09F16Service } from './p09-f16.service';

@Module({
    imports: [PrismaModule, DocumentFilesModule],
    controllers: [P09F16Controller],
    providers: [P09F16Service],
})
export class P09F16Module {}

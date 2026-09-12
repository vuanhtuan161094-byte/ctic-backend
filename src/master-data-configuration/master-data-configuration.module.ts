import { Module } from '@nestjs/common';
import { MasterDataConfigurationController } from './master-data-configuration.controller';
import { MasterDataConfigurationService } from './master-data-configuration.service';
import { StandardEditionLifecycleService } from './standard-edition-lifecycle.service';

@Module({
    controllers: [MasterDataConfigurationController],
    providers: [
        MasterDataConfigurationService,
        StandardEditionLifecycleService,
    ],
    exports: [MasterDataConfigurationService],
})
export class MasterDataConfigurationModule { }

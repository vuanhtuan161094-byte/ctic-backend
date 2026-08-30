import { Module } from '@nestjs/common';
import { MasterDataConfigurationController } from './master-data-configuration.controller';
import { MasterDataConfigurationService } from './master-data-configuration.service';

@Module({
    controllers: [MasterDataConfigurationController],
    providers: [MasterDataConfigurationService],
    exports: [MasterDataConfigurationService],
})
export class MasterDataConfigurationModule { }

import { Module } from '@nestjs/common';
import { PlatformBrandingController } from './platform-branding.controller';
import { MasterDataConfigurationController } from './master-data-configuration.controller';
import { MasterDataConfigurationService } from './master-data-configuration.service';
import { StandardEditionLifecycleService } from './standard-edition-lifecycle.service';
import { IndustryClassificationsModule } from '../industry-classifications/industry-classifications.module';

@Module({
    imports: [IndustryClassificationsModule],
    controllers: [MasterDataConfigurationController, PlatformBrandingController],
    providers: [
        MasterDataConfigurationService,
        StandardEditionLifecycleService,
    ],
    exports: [MasterDataConfigurationService],
})
export class MasterDataConfigurationModule { }

import {
  Module,
} from '@nestjs/common';

import { IndustryClassificationsController } from './industry-classifications.controller';
import { IndustryClassificationsService } from './industry-classifications.service';
import { TaxonomyRuntimePolicyService } from './taxonomy-runtime-policy.service';

@Module({
  controllers: [
    IndustryClassificationsController,
  ],

  providers: [
    IndustryClassificationsService,
    TaxonomyRuntimePolicyService,
  ],

  exports: [
    IndustryClassificationsService,
    TaxonomyRuntimePolicyService,
  ],
})
export class IndustryClassificationsModule { }

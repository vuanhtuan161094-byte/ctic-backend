import {
  Module,
} from '@nestjs/common';

import { IndustryClassificationsController } from './industry-classifications.controller';
import { IndustryClassificationsService } from './industry-classifications.service';

@Module({
  controllers: [
    IndustryClassificationsController,
  ],

  providers: [
    IndustryClassificationsService,
  ],

  exports: [
    IndustryClassificationsService,
  ],
})
export class IndustryClassificationsModule { }
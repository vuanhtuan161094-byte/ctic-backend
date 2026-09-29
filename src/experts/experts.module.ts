import {
  Module,
} from '@nestjs/common';

import { ExpertAccountBoundaryService } from './expert-account-boundary.service';
import { ExpertsController } from './experts.controller';
import { ExpertsService } from './experts.service';

@Module({
  controllers: [
    ExpertsController,
  ],

  providers: [
    {
      provide: ExpertsService,
      useClass: ExpertAccountBoundaryService,
    },
  ],

  exports: [
    ExpertsService,
  ],
})
export class ExpertsModule { }

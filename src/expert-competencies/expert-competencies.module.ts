import {
  Module,
} from '@nestjs/common';

import { ExpertCompetenciesController } from './expert-competencies.controller';
import { ExpertCompetenciesService } from './expert-competencies.service';

@Module({
  controllers: [
    ExpertCompetenciesController,
  ],

  providers: [
    ExpertCompetenciesService,
  ],

  exports: [
    ExpertCompetenciesService,
  ],
})
export class ExpertCompetenciesModule { }
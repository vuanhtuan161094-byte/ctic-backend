import {
    Module,
} from '@nestjs/common';

import { CertificationProjectScopesController } from './certification-project-scopes.controller';
import { CertificationProjectScopesService } from './certification-project-scopes.service';

@Module({
    controllers: [
        CertificationProjectScopesController,
    ],

    providers: [
        CertificationProjectScopesService,
    ],

    exports: [
        CertificationProjectScopesService,
    ],
})
export class CertificationProjectScopesModule { }
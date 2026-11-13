import {
    Module,
} from '@nestjs/common';

import { GlobalSearchController } from './global-search.controller';
import { GlobalSearchService } from './global-search.service';
import {
    PersonalWorkspaceController,
} from './personal-workspace.controller';
import {
    PersonalWorkspaceService,
} from './personal-workspace.service';

@Module({
    controllers: [
        PersonalWorkspaceController,
        GlobalSearchController,
    ],
    providers: [
        PersonalWorkspaceService,
        GlobalSearchService,
    ],
    exports: [
        PersonalWorkspaceService,
    ],
})
export class PersonalWorkspaceModule { }

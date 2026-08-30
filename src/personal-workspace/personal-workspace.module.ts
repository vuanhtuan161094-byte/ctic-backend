import {
    Module,
} from '@nestjs/common';

import {
    PersonalWorkspaceController,
} from './personal-workspace.controller';
import {
    PersonalWorkspaceService,
} from './personal-workspace.service';

@Module({
    controllers: [
        PersonalWorkspaceController,
    ],
    providers: [
        PersonalWorkspaceService,
    ],
    exports: [
        PersonalWorkspaceService,
    ],
})
export class PersonalWorkspaceModule { }

import {
    Controller,
    Get,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import {
    JwtAuthGuard,
} from '../auth/jwt-auth/jwt-auth.guard';
import {
    Roles,
} from '../auth/roles.decorator';
import {
    RolesGuard,
} from '../auth/roles.guard';
import type {
    SecurityRequest,
} from '../security/security-request';
import {
    getActorUserId,
} from '../security/security-request';
import {
    PersonalWorkspaceService,
} from './personal-workspace.service';

const INTERNAL_WORKSPACE_ROLES = [
    'ADMIN',
    'STAFF',
    'SALES',
    'COORDINATOR',
    'LEAD_AUDITOR',
    'AUDITOR',
    'TECHNICAL_EXPERT',
    'TECHNICAL_REVIEWER',
    'DECISION_MAKER',
];

@Controller('me')
@ApiTags('Không gian làm việc cá nhân')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
)
export class PersonalWorkspaceController {
    constructor(
        private readonly workspace:
            PersonalWorkspaceService,
    ) { }

    @Get('workspace')
    @ApiOperation({
        summary:
            'Lấy dashboard, công việc và lịch được chiếu theo vai trò/phân công',
    })
    @ApiOkResponse({
        description:
            'Một projection cá nhân đã lọc resource scope ở server',
    })
    @Roles(...INTERNAL_WORKSPACE_ROLES)
    getWorkspace(
        @Req()
        request: SecurityRequest,
    ) {
        return this.workspace.getWorkspace({
            userId:
                getActorUserId(request)!,
            roles:
                request.user?.roles ??
                [],
        });
    }
}

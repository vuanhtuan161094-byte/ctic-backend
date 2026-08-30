import {
    Controller,
    Get,
    Post,
    Query,
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
    WorkItemsService,
} from './work-items.service';

const WORK_ITEM_ROLES = [
    'ADMIN',
    'STAFF',
    'SALES',
    'COORDINATOR',
    'LEAD_AUDITOR',
    'AUDITOR',
    'TECHNICAL_EXPERT',
    'TECHNICAL_REVIEWER',
    'DECISION_MAKER',
    'CUSTOMER',
];

@Controller()
@ApiTags('Công việc bền vững')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
)
export class WorkItemsController {
    constructor(
        private readonly workItems:
            WorkItemsService,
    ) { }

    @Get('my-work')
    @ApiOperation({
        summary:
            'Lấy work item đang được giao và thuộc resource scope của tài khoản',
    })
    @ApiOkResponse({
        description:
            'Danh sách work item an toàn, có trạng thái quá hạn và quyền thực thi',
    })
    @Roles(...WORK_ITEM_ROLES)
    getMyWork(
        @Req()
        request: SecurityRequest,
        @Query()
        query: Record<string, string | undefined>,
    ) {
        const userId =
            getActorUserId(
                request,
            );

        return this.workItems.getMyWork(
            {
                userId:
                    userId!,
                roles:
                    request.user?.roles ??
                    [],
            },
            query,
        );
    }

    @Post('work-items/actions/reconcile')
    @ApiOperation({
        summary:
            'Đối soát work item đang thực sự actionable; mặc định chỉ dry-run',
    })
    @ApiOkResponse({
        description:
            'Kết quả dry-run hoặc áp dụng idempotent',
    })
    @Roles('ADMIN', 'COORDINATOR')
    reconcile(
        @Query('apply')
        apply?: string,
    ) {
        return this.workItems.reconcile(
            apply
                ?.trim()
                .toLowerCase() ===
                'true',
        );
    }
}

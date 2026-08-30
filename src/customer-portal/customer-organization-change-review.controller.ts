import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getActorUserId } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';
import { CustomerPortalService } from './customer-portal.service';
import { ReviewCustomerOrganizationChangeRequestDto } from './dto/review-customer-organization-change-request.dto';

@Controller('customer-change-requests')
@ApiTags('26. Yêu cầu thay đổi hồ sơ khách hàng')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN', 'COORDINATOR')
@Permissions('customer_changes.review')
export class CustomerOrganizationChangeReviewController {
    constructor(
        private readonly customerPortalService: CustomerPortalService,
    ) { }

    private actorUserId(request: SecurityRequest) {
        const userId = getActorUserId(request);
        if (!userId) {
            throw new UnauthorizedException('Authenticated user id is required');
        }
        return userId;
    }

    @Get()
    @ApiOperation({ summary: 'Danh sách yêu cầu thay đổi hồ sơ chờ nội bộ xem xét' })
    @ApiOkResponse({ description: 'Danh sách yêu cầu kèm snapshot trước/sau và tệp đính kèm' })
    findAll(
        @Query('status') status?: string,
    ) {
        return this.customerPortalService.getOrganizationChangeReviewQueue(status);
    }

    @Post(':id/review')
    @ApiOperation({ summary: 'Chấp thuận hoặc từ chối yêu cầu thay đổi hồ sơ' })
    @ApiParam({ name: 'id', format: 'uuid' })
    review(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ReviewCustomerOrganizationChangeRequestDto,
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService.reviewOrganizationChangeRequest(
            id,
            dto,
            this.actorUserId(request),
        );
    }
}

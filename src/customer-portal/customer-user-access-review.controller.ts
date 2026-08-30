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
import { ReviewCustomerUserAccessRequestDto } from './dto/review-customer-user-access-request.dto';

@Controller('customer-user-requests')
@ApiTags('26. Yêu cầu quản trị người dùng khách hàng')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN')
@Permissions('customer_user_requests.review')
export class CustomerUserAccessReviewController {
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
    @ApiOperation({ summary: 'Danh sách yêu cầu quản trị người dùng Portal để Admin xem xét' })
    @ApiOkResponse({ description: 'Danh sách yêu cầu cùng trạng thái tài khoản liên quan' })
    findAll(
        @Query('status') status?: string,
    ) {
        return this.customerPortalService.getCustomerUserAccessReviewQueue(status);
    }

    @Post(':id/review')
    @ApiOperation({
        summary: 'Admin chấp thuận hoặc từ chối yêu cầu quản trị người dùng Portal',
        description: 'Tài khoản mới chỉ được tạo khi Admin phê duyệt và cung cấp username + mật khẩu tạm thời. Mật khẩu không được lưu vào request.',
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    review(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ReviewCustomerUserAccessRequestDto,
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService.reviewCustomerUserAccessRequest(
            id,
            dto,
            this.actorUserId(request),
        );
    }
}

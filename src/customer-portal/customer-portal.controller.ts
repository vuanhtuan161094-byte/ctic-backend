import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';

import {
    JwtAuthGuard,
} from '../auth/jwt-auth/jwt-auth.guard';
import {
    Permissions,
} from '../auth/permissions.decorator';
import {
    PermissionsGuard,
} from '../auth/permissions.guard';
import {
    Roles,
} from '../auth/roles.decorator';
import {
    RolesGuard,
} from '../auth/roles.guard';
import {
    getResourceActor,
} from '../security/security-request';
import type {
    SecurityRequest,
} from '../security/security-request';
import {
    CustomerPortalService,
} from './customer-portal.service';
import {
    CustomerCertificationApplicationDto,
} from './dto/customer-certification-application.dto';
import {
    CreateCustomerOrganizationChangeRequestDto,
} from './dto/create-customer-organization-change-request.dto';
import {
    CreateCustomerUserAccessRequestDto,
} from './dto/create-customer-user-access-request.dto';

@Controller('customer-portal')
@ApiTags('26. Cổng khách hàng')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
@Roles('CUSTOMER')
@Permissions('customer_portal.access')
export class CustomerPortalController {
    constructor(
        private readonly customerPortalService:
            CustomerPortalService,
    ) { }

    @Get('me/dashboard')
    @ApiOperation({
        summary: 'Dashboard an toàn cho khách hàng hiện tại',
    })
    @ApiOkResponse({
        description: 'Tổng hợp hồ sơ, NC/CAP, lịch đánh giá và chứng chỉ thuộc customer mapping active',
    })
    dashboard(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .getDashboard(
                getResourceActor(request),
            );
    }

    @Get('me/certifications')
    @ApiOperation({
        summary: 'Danh sách hồ sơ chứng nhận an toàn cho khách hàng hiện tại',
    })
    @ApiOkResponse({
        description: 'Danh sách tối giản các hồ sơ chứng nhận thuộc customer mapping active',
    })
    certifications(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .getCertificationCases(
                getResourceActor(request),
            );
    }

    @Get('me/profile')
    @ApiOperation({
        summary: 'Hồ sơ tổ chức và người liên hệ an toàn cho cổng khách hàng',
    })
    profile(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .getProfile(
                getResourceActor(request),
            );
    }

    @Get('me/organization-change-requests')
    @ApiOperation({
        summary: 'Danh sách yêu cầu thay đổi hồ sơ tổ chức của khách hàng',
    })
    organizationChangeRequests(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService.getOrganizationChangeRequests(
            getResourceActor(request),
        );
    }

    @Post('me/organization-change-requests')
    @ApiOperation({
        summary: 'Gửi yêu cầu thay đổi hồ sơ tổ chức có snapshot trước/sau',
    })
    @ApiCreatedResponse({
        description: 'Yêu cầu được ghi nhận và tạo Work Item cho Coordinator',
    })
    createOrganizationChangeRequest(
        @Body() dto: CreateCustomerOrganizationChangeRequestDto,
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService.createOrganizationChangeRequest(
            dto,
            getResourceActor(request),
        );
    }

    @Get('me/user-access')
    @ApiOperation({
        summary: 'Danh sách người dùng Portal và lịch sử quyền truy cập theo customer mapping',
    })
    userAccess(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService.getCustomerUserAccess(
            getResourceActor(request),
        );
    }

    @Get('me/user-access-requests')
    @ApiOperation({
        summary: 'Lịch sử yêu cầu bổ sung/ngừng/khôi phục người dùng Portal',
    })
    userAccessRequests(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService.getCustomerUserAccessRequests(
            getResourceActor(request),
        );
    }

    @Post('me/user-access-requests')
    @ApiOperation({
        summary: 'Gửi yêu cầu quản trị người dùng Portal để tổ chức chứng nhận phê duyệt',
    })
    @ApiCreatedResponse({
        description: 'Yêu cầu được ghi nhận; chưa thay đổi quyền truy cập cho tới khi Admin phê duyệt',
    })
    createUserAccessRequest(
        @Body() dto: CreateCustomerUserAccessRequestDto,
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService.createCustomerUserAccessRequest(
            dto,
            getResourceActor(request),
        );
    }

    @Get('me/applications')
    @ApiOperation({
        summary: 'Danh sách đơn đăng ký của customer hiện tại',
    })
    applications(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .getApplications(
                getResourceActor(request),
            );
    }

    @Post('me/applications')
    @ApiOperation({
        summary: 'Tạo bản nháp đơn đăng ký từ cổng khách hàng',
    })
    @ApiCreatedResponse({
        description: 'Đơn được tạo dưới customer mapping đã được xác thực',
    })
    createApplication(
        @Body() dto:
            CustomerCertificationApplicationDto,
        @Req() request:
            SecurityRequest,
    ) {
        return this.customerPortalService
            .createApplication(
                dto,
                getResourceActor(request),
            );
    }

    @Patch('me/applications/:id')
    @ApiOperation({
        summary: 'Cập nhật đơn đăng ký khi còn ở trạng thái được phép sửa',
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    updateApplication(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto:
            CustomerCertificationApplicationDto,
        @Req() request:
            SecurityRequest,
    ) {
        return this.customerPortalService
            .updateApplication(
                id,
                dto,
                getResourceActor(request),
            );
    }

    @Post('me/applications/:id/submit')
    @ApiOperation({
        summary: 'Gửi đơn đăng ký cho tổ chức chứng nhận tiếp nhận',
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    submitApplication(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request:
            SecurityRequest,
    ) {
        return this.customerPortalService
            .submitApplication(
                id,
                getResourceActor(request),
            );
    }

    @Get('me/schedule')
    @ApiOperation({
        summary: 'Lịch đánh giá đã công bố cho khách hàng',
    })
    schedule(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .getSchedule(
                getResourceActor(request),
            );
    }

    @Get('me/results')
    @ApiOperation({
        summary: 'Thông báo kết quả F.12 đã gửi cho khách hàng',
    })
    results(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .getResultNotifications(
                getResourceActor(request),
            );
    }

    @Get('me/certificates')
    @ApiOperation({
        summary: 'Chứng chỉ và lịch sử version thuộc customer hiện tại',
    })
    certificates(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .getCertificates(
                getResourceActor(request),
            );
    }

    @Get('me/notifications')
    @ApiOperation({
        summary: 'Projection thông báo customer-safe',
    })
    notifications(
        @Query('limit') limit: string | undefined,
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .getNotifications(
                getResourceActor(request),
                Number(limit ?? 100),
            );
    }
    @Patch('me/notifications/read-all')
    @ApiOperation({
        summary: 'Đánh dấu đã đọc toàn bộ thông báo customer-safe',
    })
    markAllNotificationsRead(
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .markAllNotificationsRead(
                getResourceActor(request),
            );
    }

    @Patch('me/notifications/:id/read')
    @ApiOperation({
        summary: 'Đánh dấu đã đọc một thông báo customer-safe',
    })
    @ApiParam({ name: 'id', format: 'uuid' })
    markNotificationRead(
        @Param('id', ParseUUIDPipe) id: string,
        @Req() request: SecurityRequest,
    ) {
        return this.customerPortalService
            .markNotificationRead(
                id,
                getResourceActor(request),
            );
    }

}

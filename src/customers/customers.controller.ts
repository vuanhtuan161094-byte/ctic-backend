import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Put,
    Req,
    UnauthorizedException,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { getActorUserId } from '../security/security-request';
import type { SecurityRequest } from '../security/security-request';

import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerPortalUserDto } from './dto/create-customer-portal-user.dto';

@Controller('customers')
@ApiTags('02. Khách hàng')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class CustomersController {
    constructor(
        private readonly customersService:
            CustomersService,
    ) { }

    private actorUserId(
        request: SecurityRequest,
    ) {
        const userId =
            getActorUserId(request);

        if (!userId) {
            throw new UnauthorizedException(
                'Authenticated user id is required',
            );
        }

        return userId;
    }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('customers.read')
    @ApiOperation({
        summary: 'Lấy danh sách khách hàng',
    })
    @ApiOkResponse({
        description: 'Danh sách khách hàng',
    })
    @ApiUnauthorizedResponse({
        description: 'Chưa đăng nhập hoặc token không hợp lệ',
    })
    findAll() {
        return this.customersService.findAll();
    }

    @Post(':id/portal-users')
    @Roles('ADMIN')
    @Permissions('customer_user_requests.review')
    @ApiOperation({
        summary: 'Tạo hoặc liên kết tài khoản Portal cho khách hàng',
        description: 'Tạo trực tiếp tài khoản CUSTOMER cho một khách hàng đang hoạt động. Nếu email đã thuộc tài khoản CUSTOMER hợp lệ, hệ thống chỉ liên kết hoặc khôi phục quyền truy cập. Mật khẩu ban đầu chỉ được trả về một lần khi tài khoản mới được tạo.',
    })
    @ApiParam({
        name: 'id',
        description: 'Customer UUID',
    })
    @ApiCreatedResponse({
        description: 'Tài khoản Portal đã được tạo/liên kết',
    })
    provisionPortalUser(
        @Param('id', ParseUUIDPipe)
        id: string,

        @Body()
        dto: CreateCustomerPortalUserDto,

        @Req()
        request: SecurityRequest,
    ) {
        return this.customersService
            .provisionPortalUser(
                id,
                dto,
                this.actorUserId(request),
            );
    }

    @Post(':id/portal-users/:userId/reset-password')
    @Roles('ADMIN')
    @Permissions('customer_user_requests.review')
    @ApiOperation({
        summary: 'Tạo mật khẩu mới cho tài khoản Portal khách hàng',
        description: 'Chỉ áp dụng cho tài khoản CUSTOMER đã liên kết với khách hàng này. Mật khẩu mới chỉ được trả về một lần.',
    })
    @ApiParam({ name: 'id', description: 'Customer UUID' })
    @ApiParam({ name: 'userId', description: 'CUSTOMER user UUID' })
    @ApiOkResponse({ description: 'Đã tạo mật khẩu mới' })
    resetPortalUserPassword(
        @Param('id', ParseUUIDPipe)
        id: string,

        @Param('userId', ParseUUIDPipe)
        userId: string,

        @Req()
        request: SecurityRequest,
    ) {
        return this.customersService
            .resetPortalUserPassword(
                id,
                userId,
                this.actorUserId(request),
            );
    }

    @Get(':id/user-access')
    @Roles('ADMIN')
    @Permissions('customers.manage')
    @ApiOperation({
        summary: 'List customer user access mappings',
    })
    @ApiParam({
        name: 'id',
        description: 'Customer UUID',
    })
    @ApiOkResponse({
        description: 'Customer user access mappings',
    })
    @ApiNotFoundResponse({
        description: 'Customer not found',
    })
    findUserAccess(
        @Param('id', ParseUUIDPipe)
        id: string,
    ) {
        return this.customersService
            .findUserAccess(id);
    }

    @Put(':id/user-access/:userId')
    @Roles('ADMIN')
    @Permissions('customers.manage')
    @ApiOperation({
        summary: 'Assign or reactivate customer user access',
    })
    @ApiParam({
        name: 'id',
        description: 'Customer UUID',
    })
    @ApiParam({
        name: 'userId',
        description: 'Target CUSTOMER user UUID',
    })
    @ApiOkResponse({
        description: 'Customer user access is active',
    })
    @ApiBadRequestResponse({
        description: 'Customer or target user is inactive, or target user lacks CUSTOMER role',
    })
    @ApiNotFoundResponse({
        description: 'Customer or target user not found',
    })
    assignUserAccess(
        @Param('id', ParseUUIDPipe)
        id: string,

        @Param('userId', ParseUUIDPipe)
        userId: string,

        @Req()
        request: SecurityRequest,
    ) {
        return this.customersService
            .assignUserAccess(
                id,
                userId,
                this.actorUserId(request),
            );
    }

    @Delete(':id/user-access/:userId')
    @Roles('ADMIN')
    @Permissions('customers.manage')
    @ApiOperation({
        summary: 'Revoke customer user access',
        description: 'Soft-revokes the mapping; no row is physically deleted.',
    })
    @ApiParam({
        name: 'id',
        description: 'Customer UUID',
    })
    @ApiParam({
        name: 'userId',
        description: 'Target CUSTOMER user UUID',
    })
    @ApiOkResponse({
        description: 'Customer user access is revoked',
    })
    @ApiNotFoundResponse({
        description: 'Customer or customer user access mapping not found',
    })
    revokeUserAccess(
        @Param('id', ParseUUIDPipe)
        id: string,

        @Param('userId', ParseUUIDPipe)
        userId: string,

        @Req()
        request: SecurityRequest,
    ) {
        return this.customersService
            .revokeUserAccess(
                id,
                userId,
                this.actorUserId(request),
            );
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'LEAD_AUDITOR',
        'TECHNICAL_REVIEWER',
        'DECISION_MAKER',
    )
    @Permissions('customers.read')
    @ApiOperation({
        summary: 'Lấy chi tiết khách hàng',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của khách hàng',
        example: '38a52535-6770-410d-ab71-d23f933d0935',
    })
    @ApiOkResponse({
        description: 'Thông tin khách hàng',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy khách hàng',
    })
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.customersService.findOne(id);
    }

    @Post()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
    )
    @Permissions('customers.manage')
    @ApiOperation({
        summary: 'Tạo khách hàng',
    })
    @ApiCreatedResponse({
        description: 'Tạo khách hàng thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu không hợp lệ',
    })
    @ApiConflictResponse({
        description: 'Mã khách hàng hoặc mã số thuế đã tồn tại',
    })
    create(
        @Body()
        dto: CreateCustomerDto,
    ) {
        return this.customersService.create(dto);
    }

    @Patch(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
    )
    @Permissions('customers.manage')
    @ApiOperation({
        summary: 'Cập nhật khách hàng',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của khách hàng',
    })
    @ApiOkResponse({
        description: 'Cập nhật khách hàng thành công',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy khách hàng',
    })
    update(
        @Param('id')
        id: string,

        @Body()
        dto: UpdateCustomerDto,
    ) {
        return this.customersService.update(
            id,
            dto,
        );
    }

    @Patch(':id/reactivate')
    @Roles('ADMIN')
    @Permissions('customers.manage')
    @ApiOperation({
        summary: 'Khôi phục hoạt động khách hàng',
        description:
            'Khôi phục khách hàng đã ngừng hoạt động trên chính bản ghi cũ để bảo toàn toàn bộ lịch sử và hồ sơ liên kết.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của khách hàng',
    })
    @ApiOkResponse({
        description: 'Khách hàng đã được khôi phục hoạt động',
    })
    @ApiBadRequestResponse({
        description: 'Khách hàng đang hoạt động',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy khách hàng',
    })
    reactivate(
        @Param('id')
        id: string,
    ) {
        return this.customersService.reactivate(id);
    }

    @Delete(':id')
    @Roles('ADMIN')
    @Permissions('customers.manage')
    @ApiOperation({
        summary: 'Ngừng hoạt động khách hàng',
        description:
            'Chuyển trạng thái khách hàng sang inactive, không xóa dữ liệu vật lý.',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của khách hàng',
    })
    @ApiOkResponse({
        description: 'Khách hàng đã được chuyển sang inactive',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy khách hàng',
    })
    remove(
        @Param('id')
        id: string,
    ) {
        return this.customersService.remove(id);
    }
}

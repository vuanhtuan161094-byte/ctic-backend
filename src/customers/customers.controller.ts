import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
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

import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

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

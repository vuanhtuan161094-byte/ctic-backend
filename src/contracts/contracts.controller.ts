import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiCreatedResponse,
    ApiNotFoundResponse,
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

import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';

@Controller('contracts')
@ApiTags('05. Hợp đồng')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class ContractsController {
    constructor(
        private readonly contractsService:
            ContractsService,
    ) { }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
    )
    @Permissions('contracts.read')
    @ApiOperation({
        summary: 'Lấy danh sách hợp đồng',
    })
    @ApiOkResponse({
        description: 'Danh sách hợp đồng và khách hàng liên quan',
    })
    findAll() {
        return this.contractsService.findAll();
    }

    @Get(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
    )
    @Permissions('contracts.read')
    @ApiOperation({
        summary: 'Lấy chi tiết hợp đồng',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của hợp đồng',
        example: '36dc9d7a-1bea-4b37-882a-ef8da82c8d1e',
    })
    @ApiOkResponse({
        description: 'Thông tin hợp đồng',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy hợp đồng',
    })
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.contractsService.findOne(id);
    }

    @Post()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
    )
    @Permissions('contracts.manage')
    @ApiOperation({
        summary: 'Tạo hợp đồng',
    })
    @ApiCreatedResponse({
        description: 'Tạo hợp đồng thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu không hợp lệ, số hợp đồng trùng hoặc khoảng ngày không hợp lệ',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy khách hàng',
    })
    create(
        @Body()
        dto: CreateContractDto,
    ) {
        return this.contractsService.create(dto);
    }
}

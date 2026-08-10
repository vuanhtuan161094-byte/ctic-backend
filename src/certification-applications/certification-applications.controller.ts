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
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CertificationApplicationsService } from './certification-applications.service';
import { CreateCertificationApplicationDto } from './dto/create-certification-application.dto';

@Controller('certification-applications')
@ApiTags('03. Đăng ký chứng nhận')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class CertificationApplicationsController {
    constructor(
        private readonly certificationApplicationsService:
            CertificationApplicationsService,
    ) { }

    @Get()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
        'TECHNICAL_REVIEWER',
    )
    @Permissions('applications.read')
    @ApiOperation({
        summary: 'Lấy danh sách hồ sơ đăng ký chứng nhận',
    })
    @ApiOkResponse({
        description: 'Danh sách hồ sơ đăng ký và thông tin khách hàng',
    })
    findAll() {
        return this.certificationApplicationsService.findAll();
    }

    @Post()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
    )
    @Permissions('applications.manage')
    @ApiOperation({
        summary: 'Tạo hồ sơ đăng ký chứng nhận',
    })
    @ApiCreatedResponse({
        description: 'Tạo hồ sơ đăng ký thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu không hợp lệ, mã hồ sơ trùng hoặc khách hàng đã ngừng hoạt động',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy khách hàng',
    })
    create(
        @Body()
        dto: CreateCertificationApplicationDto,
    ) {
        return this.certificationApplicationsService.create(
            dto,
        );
    }

    @Patch(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
    )
    @Permissions('applications.manage')
    @ApiOperation({
        summary: 'Cập nhật đơn đăng ký chứng nhận',
    })
    @ApiOkResponse({
        description: 'Cập nhật đơn đăng ký thành công',
    })
    update(
        @Param('id') id: string,
        @Body() dto: CreateCertificationApplicationDto,
    ) {
        return this.certificationApplicationsService.update(id, dto);
    }

    @Delete(':id')
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
        'COORDINATOR',
    )
    @Permissions('applications.manage')
    @ApiOperation({
        summary: 'Xóa đơn đăng ký chưa liên kết hồ sơ chứng nhận',
    })
    @ApiOkResponse({
        description: 'Xóa đơn đăng ký thành công',
    })
    remove(@Param('id') id: string) {
        return this.certificationApplicationsService.remove(id);
    }
}

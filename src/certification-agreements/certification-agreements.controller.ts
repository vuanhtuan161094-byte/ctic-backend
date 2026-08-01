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

import { CertificationAgreementsService } from './certification-agreements.service';
import { CreateCertificationAgreementDto } from './dto/create-certification-agreement.dto';

@Controller('certification-agreements')
@ApiTags('06. Thỏa thuận chứng nhận')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class CertificationAgreementsController {
    constructor(
        private readonly certificationAgreementsService:
            CertificationAgreementsService,
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
        summary: 'Lấy danh sách thỏa thuận chứng nhận',
    })
    @ApiOkResponse({
        description: 'Danh sách thỏa thuận, khách hàng và hợp đồng liên quan',
    })
    findAll() {
        return this.certificationAgreementsService.findAll();
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
        summary: 'Lấy chi tiết thỏa thuận chứng nhận',
    })
    @ApiParam({
        name: 'id',
        description: 'UUID của thỏa thuận chứng nhận',
        example: 'cbf05033-9f09-4daa-8b89-859a500685bc',
    })
    @ApiOkResponse({
        description: 'Thông tin thỏa thuận chứng nhận',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy thỏa thuận chứng nhận',
    })
    findOne(
        @Param('id')
        id: string,
    ) {
        return this.certificationAgreementsService.findOne(
            id,
        );
    }

    @Post()
    @Roles(
        'ADMIN',
        'STAFF',
        'SALES',
    )
    @Permissions('contracts.manage')
    @ApiOperation({
        summary: 'Tạo thỏa thuận chứng nhận',
    })
    @ApiCreatedResponse({
        description: 'Tạo thỏa thuận chứng nhận thành công',
    })
    @ApiBadRequestResponse({
        description: 'Dữ liệu hoặc quan hệ khách hàng - hợp đồng không hợp lệ',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy khách hàng hoặc hợp đồng',
    })
    create(
        @Body()
        dto: CreateCertificationAgreementDto,
    ) {
        return this.certificationAgreementsService.create(
            dto,
        );
    }
}

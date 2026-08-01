import {
    Body,
    Controller,
    Get,
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

import { ApplicationReviewsService } from './application-reviews.service';
import { CreateApplicationReviewDto } from './dto/create-application-review.dto';

@Controller('application-reviews')
@ApiTags('04. Xem xét đăng ký')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
export class ApplicationReviewsController {
    constructor(
        private readonly applicationReviewsService:
            ApplicationReviewsService,
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
        summary: 'Lấy danh sách kết quả xem xét đăng ký',
    })
    @ApiOkResponse({
        description: 'Danh sách kết quả xem xét hồ sơ',
    })
    findAll() {
        return this.applicationReviewsService.findAll();
    }

    @Post()
    @Roles(
        'ADMIN',
        'COORDINATOR',
    )
    @Permissions('applications.review')
    @ApiOperation({
        summary: 'Xem xét hồ sơ đăng ký chứng nhận',
        description:
            'Ghi nhận kết quả và tự cập nhật trạng thái hồ sơ đăng ký.',
    })
    @ApiCreatedResponse({
        description: 'Đã ghi nhận kết quả xem xét',
    })
    @ApiBadRequestResponse({
        description: 'Kết quả xem xét hoặc dữ liệu không hợp lệ',
    })
    @ApiNotFoundResponse({
        description: 'Không tìm thấy hồ sơ đăng ký',
    })
    create(
        @Body()
        dto: CreateApplicationReviewDto,
    ) {
        return this.applicationReviewsService.create(
            dto,
        );
    }
}

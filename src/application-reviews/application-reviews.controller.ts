import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Req,
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
import {
    ApproveApplicationReviewDto,
    CheckApplicationReviewDto,
} from './dto/review-workflow-action.dto';

type AuthenticatedRequest = {
    user?: {
        id?: string;
        userId?: string;
        sub?: string;
        roles?: string[];
    };
};

@Controller('application-reviews')
@ApiTags('04. Xem xét đăng ký')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ApplicationReviewsController {
    constructor(
        private readonly applicationReviewsService: ApplicationReviewsService,
    ) { }

    private currentUser(request: AuthenticatedRequest) {
        const id = request.user?.id ?? request.user?.userId ?? request.user?.sub;
        return {
            id: id ?? '',
            roles: request.user?.roles ?? [],
        };
    }

    @Get('assignees')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR', 'TECHNICAL_REVIEWER')
    @Permissions('applications.read')
    @ApiOperation({ summary: 'Lấy danh sách đánh giá viên/người kiểm tra có thể phân công' })
    @ApiOkResponse({ description: 'Danh sách tài khoản theo vai trò phù hợp' })
    findAssignees() {
        return this.applicationReviewsService.findAssignees();
    }

    @Get()
    @Roles('ADMIN', 'STAFF', 'SALES', 'COORDINATOR', 'TECHNICAL_REVIEWER')
    @Permissions('applications.read')
    @ApiOperation({ summary: 'Lấy danh sách kết quả xem xét đăng ký' })
    @ApiOkResponse({ description: 'Danh sách kết quả xem xét hồ sơ' })
    findAll() {
        return this.applicationReviewsService.findAll();
    }

    @Post()
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('applications.review')
    @ApiOperation({
        summary: 'Lập bản xem xét và gửi người kiểm tra kỹ thuật',
        description:
            'Điều phối viên lập nội dung xem xét, phân công đánh giá viên và chuyển sang bước kiểm tra/xác nhận.',
    })
    @ApiCreatedResponse({ description: 'Đã gửi bản xem xét tới đánh giá viên' })
    @ApiBadRequestResponse({ description: 'Dữ liệu hoặc phân công không hợp lệ' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ đăng ký' })
    create(
        @Body() dto: CreateApplicationReviewDto,
        @Req() request: AuthenticatedRequest,
    ) {
        const currentUser = this.currentUser(request);
        return this.applicationReviewsService.create(dto, currentUser.id);
    }

    @Patch(':id/check')
    @Roles('ADMIN', 'AUDITOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('applications.review')
    @ApiOperation({ summary: 'Đánh giá viên kiểm tra và xác nhận bản xem xét đăng ký' })
    @ApiOkResponse({ description: 'Đã cập nhật bước kiểm tra kỹ thuật' })
    check(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: CheckApplicationReviewDto,
        @Req() request: AuthenticatedRequest,
    ) {
        const currentUser = this.currentUser(request);
        return this.applicationReviewsService.check(
            id,
            dto,
            currentUser.id,
            currentUser.roles,
        );
    }

    @Patch(':id/approve')
    @Roles('ADMIN', 'APPROVER', 'CERTIFICATION_MANAGER', 'TECHNICAL_REVIEWER')
    @Permissions('applications.review')
    @ApiOperation({ summary: 'Phê duyệt bản xem xét đăng ký' })
    @ApiOkResponse({ description: 'Đã cập nhật kết quả phê duyệt' })
    approve(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ApproveApplicationReviewDto,
        @Req() request: AuthenticatedRequest,
    ) {
        const currentUser = this.currentUser(request);
        return this.applicationReviewsService.approve(
            id,
            dto,
            currentUser.id,
            currentUser.roles,
        );
    }
}

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
import { ReviewApplicationReviewDto } from './dto/review-workflow-action.dto';

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

    @Get(':id/capability-evaluation')
    @Roles('ADMIN', 'STAFF', 'COORDINATOR', 'AUDITOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('applications.read')
    @ApiOperation({ summary: 'Đánh giá năng lực tổ chức chứng nhận theo Program + IAF' })
    @ApiOkResponse({ description: 'Kết quả CAPABLE / REVIEW_REQUIRED / NOT_CAPABLE' })
    evaluateCapability(@Param('id', ParseUUIDPipe) id: string) {
        return this.applicationReviewsService.evaluateCapability(id);
    }

    @Post()
    @Roles('ADMIN', 'COORDINATOR')
    @Permissions('applications.review')
    @ApiOperation({
        summary: 'Lưu nháp hoặc gửi bản xem xét đăng ký cho một reviewer',
        description:
            'Điều phối viên lập nội dung xem xét, hoàn thiện phân loại/ngày công và phân công một đánh giá viên xem xét.',
    })
    @ApiCreatedResponse({ description: 'Đã lưu nháp hoặc gửi bản xem xét tới reviewer' })
    @ApiBadRequestResponse({ description: 'Dữ liệu hoặc phân công không hợp lệ' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy hồ sơ đăng ký' })
    create(
        @Body() dto: CreateApplicationReviewDto,
        @Req() request: AuthenticatedRequest,
    ) {
        const currentUser = this.currentUser(request);
        return this.applicationReviewsService.create(dto, currentUser.id);
    }

    @Patch(':id/review')
    @Roles('AUDITOR', 'LEAD_AUDITOR', 'TECHNICAL_REVIEWER')
    @Permissions('applications.review')
    @ApiOperation({ summary: 'Reviewer phê duyệt hoặc trả lại bản xem xét đăng ký' })
    @ApiOkResponse({ description: 'Đã cập nhật quyết định của reviewer' })
    review(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() dto: ReviewApplicationReviewDto,
        @Req() request: AuthenticatedRequest,
    ) {
        const currentUser = this.currentUser(request);
        return this.applicationReviewsService.review(
            id,
            dto,
            currentUser.id,
            currentUser.roles,
        );
    }
}

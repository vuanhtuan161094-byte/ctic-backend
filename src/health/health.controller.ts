import {
    Controller,
    Get,
} from '@nestjs/common';

import {
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
} from '@nestjs/swagger';

import {
    HealthService,
} from './health.service';

@Controller('health')
@ApiTags('00. Trạng thái hệ thống')
export class HealthController {
    constructor(
        private readonly healthService:
            HealthService,
    ) { }

    @Get()
    @ApiOperation({ summary: 'Kiểm tra khả năng phục vụ và kết nối cơ sở dữ liệu' })
    @ApiOkResponse({ description: 'Ứng dụng và cơ sở dữ liệu sẵn sàng' })
    @ApiServiceUnavailableResponse({ description: 'Cơ sở dữ liệu chưa sẵn sàng' })
    getReadiness():
        Promise<unknown> {
        return this.healthService
            .getReadiness();
    }

    @Get('live')
    @ApiOperation({ summary: 'Kiểm tra tiến trình backend đang hoạt động' })
    @ApiOkResponse({ description: 'Tiến trình backend đang hoạt động' })
    getLiveness():
        unknown {
        return this.healthService
            .getLiveness();
    }
}

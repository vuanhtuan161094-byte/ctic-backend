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
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';

import type {
    Request,
} from 'express';

import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiConflictResponse,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UsersService } from './users.service';

type AuthenticatedRequest =
    Request & {
        user: {
            userId: string;
            username: string;
            roles: string[];
            permissions?: string[];
        };
    };

@Controller('users')
@ApiTags('26. Người dùng, vai trò và quyền')
@ApiBearerAuth('jwt')
@UseGuards(
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
)
@UsePipes(
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }),
)
export class UsersController {
    constructor(
        private readonly usersService:
            UsersService,
    ) { }

    @Get('roles')
    @ApiOperation({ summary: 'Lấy danh sách vai trò và các quyền được gán' })
    @ApiOkResponse({ description: 'Danh sách vai trò' })
    @Roles('ADMIN')
    @Permissions('users.read')
    findRoles(): Promise<unknown> {
        return this.usersService.findRoles();
    }

    @Post('roles')
    @ApiOperation({ summary: 'Tạo vai trò mới' })
    @ApiCreatedResponse({ description: 'Đã tạo vai trò' })
    @ApiBadRequestResponse({ description: 'Dữ liệu vai trò không hợp lệ' })
    @ApiConflictResponse({ description: 'Tên vai trò đã tồn tại' })
    @Roles('ADMIN')
    @Permissions('users.manage')
    createRole(
        @Body()
        dto: CreateRoleDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.usersService.createRole(
            dto,
            request.user.userId,
        );
    }

    @Get('permissions')
    @ApiOperation({ summary: 'Lấy danh mục quyền của hệ thống' })
    @ApiOkResponse({ description: 'Danh sách quyền' })
    @Roles('ADMIN')
    @Permissions('users.read')
    findPermissions(): Promise<unknown> {
        return this.usersService.findPermissions();
    }

    @Post('permissions')
    @ApiOperation({ summary: 'Tạo quyền mới' })
    @ApiCreatedResponse({ description: 'Đã tạo quyền' })
    @ApiBadRequestResponse({ description: 'Mã quyền không hợp lệ' })
    @ApiConflictResponse({ description: 'Mã quyền đã tồn tại' })
    @Roles('ADMIN')
    @Permissions('users.manage')
    createPermission(
        @Body()
        dto: CreatePermissionDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.usersService.createPermission(
            dto,
            request.user.userId,
        );
    }

    @Patch('roles/:roleId/permissions')
    @ApiOperation({ summary: 'Thay thế toàn bộ quyền của một vai trò' })
    @ApiParam({ name: 'roleId', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã cập nhật quyền của vai trò' })
    @ApiBadRequestResponse({ description: 'Danh sách quyền không hợp lệ' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy vai trò hoặc quyền' })
    @Roles('ADMIN')
    @Permissions('users.manage')
    replaceRolePermissions(
        @Param(
            'roleId',
            ParseUUIDPipe,
        )
        roleId: string,

        @Body()
        dto: UpdateRolePermissionsDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.usersService.replaceRolePermissions(
            roleId,
            dto,
            request.user.userId,
        );
    }

    @Get()
    @ApiOperation({ summary: 'Lấy danh sách tài khoản người dùng' })
    @ApiQuery({ name: 'search', required: false, example: 'auditor' })
    @ApiQuery({
        name: 'status',
        required: false,
        enum: ['active', 'inactive', 'locked'],
    })
    @ApiQuery({ name: 'role', required: false, example: 'auditor' })
    @ApiOkResponse({ description: 'Danh sách tài khoản' })
    @Roles('ADMIN')
    @Permissions('users.read')
    findAll(
        @Query('search')
        search?: string,

        @Query('status')
        status?: string,

        @Query('role')
        role?: string,
    ): Promise<unknown> {
        return this.usersService.findAll(
            search,
            status,
            role,
        );
    }

    @Get(':id')
    @ApiOperation({ summary: 'Lấy chi tiết tài khoản' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Chi tiết tài khoản và vai trò' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản' })
    @Roles('ADMIN')
    @Permissions('users.read')
    findOne(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,
    ): Promise<unknown> {
        return this.usersService.findOne(id);
    }

    @Post()
    @ApiOperation({ summary: 'Tạo tài khoản nội bộ và gán vai trò' })
    @ApiCreatedResponse({ description: 'Đã tạo tài khoản' })
    @ApiBadRequestResponse({ description: 'Dữ liệu tài khoản không hợp lệ' })
    @ApiConflictResponse({ description: 'Username hoặc email đã tồn tại' })
    @Roles('ADMIN')
    @Permissions('users.manage')
    create(
        @Body()
        dto: CreateUserDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.usersService.create(
            dto,
            request.user.userId,
        );
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Cập nhật hoặc khóa/mở khóa tài khoản' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã cập nhật tài khoản' })
    @ApiBadRequestResponse({ description: 'Dữ liệu cập nhật không hợp lệ' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản' })
    @Roles('ADMIN')
    @Permissions('users.manage')
    update(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Body()
        dto: UpdateUserDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.usersService.update(
            id,
            dto,
            request.user.userId,
        );
    }

    @Patch(':id/roles')
    @ApiOperation({ summary: 'Thay thế toàn bộ vai trò của tài khoản' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã cập nhật vai trò của tài khoản' })
    @ApiBadRequestResponse({ description: 'Danh sách vai trò không hợp lệ' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản hoặc vai trò' })
    @Roles('ADMIN')
    @Permissions('users.manage')
    replaceRoles(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Body()
        dto: UpdateUserRolesDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.usersService.replaceRoles(
            id,
            dto,
            request.user.userId,
        );
    }

    @Patch(':id/reset-password')
    @ApiOperation({ summary: 'Đặt lại mật khẩu tài khoản' })
    @ApiParam({ name: 'id', format: 'uuid' })
    @ApiOkResponse({ description: 'Đã đặt lại mật khẩu tài khoản' })
    @ApiBadRequestResponse({ description: 'Mật khẩu mới không hợp lệ' })
    @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản' })
    @Roles('ADMIN')
    @Permissions('users.manage')
    resetPassword(
        @Param(
            'id',
            ParseUUIDPipe,
        )
        id: string,

        @Body()
        dto: ResetUserPasswordDto,

        @Req()
        request: AuthenticatedRequest,
    ): Promise<unknown> {
        return this.usersService.resetPassword(
            id,
            dto,
            request.user.userId,
        );
    }
}

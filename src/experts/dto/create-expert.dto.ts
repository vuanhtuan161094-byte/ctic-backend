import {
    IsDateString,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
} from 'class-validator';
import {
    ApiProperty,
    ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateExpertDto {
    @ApiProperty({
        description: 'Tài khoản người dùng được liên kết với hồ sơ chuyên gia',
        format: 'uuid',
    })
    @IsUUID()
    user_id!: string;

    @ApiPropertyOptional({
        example: 'CG-0001',
        description: 'Mã chuyên gia nội bộ',
        maxLength: 50,
    })
    @IsOptional()
    @IsString()
    @MaxLength(50)
    employee_code?: string;

    @ApiPropertyOptional({
        example: '0901234567',
        description: 'Số điện thoại',
        maxLength: 20,
    })
    @IsOptional()
    @IsString()
    @MaxLength(20)
    phone?: string;

    @ApiPropertyOptional({
        example: '1988-05-20',
        description: 'Ngày sinh',
        format: 'date',
    })
    @IsOptional()
    @IsDateString()
    date_of_birth?: string;

    @ApiPropertyOptional({
        example: 'male',
        enum: ['male', 'female', 'other'],
    })
    @IsOptional()
    @IsIn(['male', 'female', 'other'])
    gender?: string;

    @ApiPropertyOptional({
        description: 'Địa chỉ liên hệ',
        maxLength: 500,
    })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    address?: string;

    @ApiPropertyOptional({
        example: 'internal',
        enum: ['internal', 'external'],
        description: 'Loại nhân sự',
    })
    @IsOptional()
    @IsIn(['internal', 'external'])
    employment_type?: string;

    @ApiPropertyOptional({
        description: 'Đơn vị công tác',
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    organization?: string;

    @ApiPropertyOptional({
        description: 'Chức danh công việc',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    job_title?: string;

    @ApiPropertyOptional({
        description: 'Trình độ học vấn',
        maxLength: 100,
    })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    education_level?: string;

    @ApiPropertyOptional({
        description: 'Chuyên ngành',
        maxLength: 255,
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    specialization?: string;

    @ApiPropertyOptional({
        description: 'Tóm tắt bằng cấp và đào tạo',
    })
    @IsOptional()
    @IsString()
    education_summary?: string;

    @ApiPropertyOptional({
        description: 'Tóm tắt kinh nghiệm chuyên môn',
    })
    @IsOptional()
    @IsString()
    experience_summary?: string;

    @ApiPropertyOptional({
        example: 'active',
        enum: ['active', 'inactive'],
        default: 'active',
    })
    @IsOptional()
    @IsIn(['active', 'inactive'])
    status?: string;
}

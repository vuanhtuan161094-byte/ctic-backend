import { PartialType } from '@nestjs/swagger';
import { CreateMandayCalculationDto } from './create-manday-calculation.dto';

export class UpdateMandayCalculationDto extends PartialType(
    CreateMandayCalculationDto,
) { }

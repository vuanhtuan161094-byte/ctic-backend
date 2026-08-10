import { PartialType } from '@nestjs/swagger';
import { CreateExpertCertificateDto } from './create-expert-certificate.dto';

export class UpdateExpertCertificateDto extends PartialType(
    CreateExpertCertificateDto,
) {}

import { Module } from '@nestjs/common';
import { CommercialManagementReportingController } from './commercial-management-reporting.controller';
import { CommercialManagementReportingService } from './commercial-management-reporting.service';

@Module({
    controllers: [CommercialManagementReportingController],
    providers: [CommercialManagementReportingService],
    exports: [CommercialManagementReportingService],
})
export class CommercialManagementReportingModule { }

import {
    Module,
} from '@nestjs/common';

import {
    ConfigModule,
} from '@nestjs/config';

import {
    ScheduleModule,
} from '@nestjs/schedule';

import { ApplicationReviewsModule } from './application-reviews/application-reviews.module';
import { AuditDocumentsModule } from './audit-documents/audit-documents.module';
import { AuditFindingsModule } from './audit-findings/audit-findings.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuditPlansModule } from './audit-plans/audit-plans.module';
import { AuditProgramsModule } from './audit-programs/audit-programs.module';
import { AuditResultNotificationsModule } from './audit-result-notifications/audit-result-notifications.module';
import { AuditTeamAppointmentsModule } from './audit-team-appointments/audit-team-appointments.module';
import { AuthModule } from './auth/auth.module';
import { CertificatesModule } from './certificates/certificates.module';
import { CertificationAgreementsModule } from './certification-agreements/certification-agreements.module';
import { CertificationBodyCapabilitiesModule } from './certification-body-capabilities/certification-body-capabilities.module';
import { CertificationApplicationsModule } from './certification-applications/certification-applications.module';
import { CertificationDecisionsModule } from './certification-decisions/certification-decisions.module';
import { CertificationProjectScopesModule } from './certification-project-scopes/certification-project-scopes.module';
import { CertificationResultsModule } from './certification-results/certification-results.module';
import { CertificationProjectsModule } from './certification-projects/certification-projects.module';
import { ContractsModule } from './contracts/contracts.module';
import { CommercialManagementReportingModule } from './commercial-management-reporting/commercial-management-reporting.module';
import { CustomersModule } from './customers/customers.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';
import { CustomerDocumentsModule } from './customer-documents/customer-documents.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DocumentFilesModule } from './document-files/document-files.module';
import { DocumentControlModule } from './document-control/document-control.module';
import { ExpertCompetenciesModule } from './expert-competencies/expert-competencies.module';
import { GovernanceCasesModule } from './governance-cases/governance-cases.module';
import { ExpertsModule } from './experts/experts.module';
import { HealthModule } from './health/health.module';
import { IndustryClassificationsModule } from './industry-classifications/industry-classifications.module';
import { MandayCalculationsModule } from './manday-calculations/manday-calculations.module';
import { MasterDataConfigurationModule } from './master-data-configuration/master-data-configuration.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PersonalWorkspaceModule } from './personal-workspace/personal-workspace.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { SecurityModule } from './security/security.module';
import { TechnicalReviewsModule } from './technical-reviews/technical-reviews.module';
import { DelegationsModule } from './delegations/delegations.module';
import { SurveillanceInformationModule } from './surveillance-information/surveillance-information.module';
import { UsersModule } from './users/users.module';
import { WorkItemsModule } from './work-items/work-items.module';
import { SystemAdministrationModule } from './system-administration/system-administration.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),

        ScheduleModule.forRoot(),

        PrismaModule,
        SecurityModule,
        WorkItemsModule,
        HealthModule,
        AuthModule,
        UsersModule,
        CustomersModule,
        CustomerPortalModule,
        CustomerDocumentsModule,
        CertificationApplicationsModule,
        CertificationBodyCapabilitiesModule,
        ApplicationReviewsModule,
        ContractsModule,
        CommercialManagementReportingModule,
        CertificationAgreementsModule,
        CertificationProjectsModule,
        CertificationProjectScopesModule,
        MandayCalculationsModule,
        AuditProgramsModule,
        AuditDocumentsModule,
        AuditPlansModule,
        AuditTeamAppointmentsModule,
        ReportsModule,
        AuditFindingsModule,
        TechnicalReviewsModule,
        DelegationsModule,
        SurveillanceInformationModule,
        DocumentFilesModule,
        DocumentControlModule,
        CertificationDecisionsModule,
        CertificationResultsModule,
        AuditResultNotificationsModule,
        CertificatesModule,
        DashboardModule,
        NotificationsModule,
        PersonalWorkspaceModule,
        ExpertsModule,
        ExpertCompetenciesModule,
        GovernanceCasesModule,
        IndustryClassificationsModule,
        MasterDataConfigurationModule,
        AuditLogsModule,
        SystemAdministrationModule,
    ],
})
export class AppModule { }

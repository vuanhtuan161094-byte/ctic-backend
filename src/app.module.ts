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
import { AuditFindingsModule } from './audit-findings/audit-findings.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuditPlansModule } from './audit-plans/audit-plans.module';
import { AuditProgramsModule } from './audit-programs/audit-programs.module';
import { AuditResultNotificationsModule } from './audit-result-notifications/audit-result-notifications.module';
import { AuditTeamAppointmentsModule } from './audit-team-appointments/audit-team-appointments.module';
import { AuthModule } from './auth/auth.module';
import { CertificatesModule } from './certificates/certificates.module';
import { CertificationAgreementsModule } from './certification-agreements/certification-agreements.module';
import { CertificationApplicationsModule } from './certification-applications/certification-applications.module';
import { CertificationDecisionsModule } from './certification-decisions/certification-decisions.module';
import { CertificationProjectScopesModule } from './certification-project-scopes/certification-project-scopes.module';
import { CertificationProjectsModule } from './certification-projects/certification-projects.module';
import { ContractsModule } from './contracts/contracts.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DocumentFilesModule } from './document-files/document-files.module';
import { ExpertCompetenciesModule } from './expert-competencies/expert-competencies.module';
import { ExpertsModule } from './experts/experts.module';
import { HealthModule } from './health/health.module';
import { IndustryClassificationsModule } from './industry-classifications/industry-classifications.module';
import { MandayCalculationsModule } from './manday-calculations/manday-calculations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { TechnicalReviewsModule } from './technical-reviews/technical-reviews.module';
import { UsersModule } from './users/users.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
        }),

        ScheduleModule.forRoot(),

        PrismaModule,
        HealthModule,
        AuthModule,
        UsersModule,
        CustomersModule,
        CertificationApplicationsModule,
        ApplicationReviewsModule,
        ContractsModule,
        CertificationAgreementsModule,
        CertificationProjectsModule,
        CertificationProjectScopesModule,
        MandayCalculationsModule,
        AuditProgramsModule,
        AuditPlansModule,
        AuditTeamAppointmentsModule,
        ReportsModule,
        AuditFindingsModule,
        TechnicalReviewsModule,
        DocumentFilesModule,
        CertificationDecisionsModule,
        AuditResultNotificationsModule,
        CertificatesModule,
        DashboardModule,
        NotificationsModule,
        ExpertsModule,
        ExpertCompetenciesModule,
        IndustryClassificationsModule,
        AuditLogsModule,
    ],
})
export class AppModule { }
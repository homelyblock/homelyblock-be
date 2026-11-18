import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { ComplaintsModule } from '../complaints/complaints.module.js';
import { NoticesModule } from '../notices/notices.module.js';
import { VisitorsModule } from '../visitors/visitors.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    BillingModule,
    ComplaintsModule,
    NoticesModule,
    VisitorsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}

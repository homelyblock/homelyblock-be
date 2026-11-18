import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { validateEnv } from './config/env.validation.js';
import { GlobalThrottlerModule } from './common/throttler.config.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { BillingModule } from './billing/billing.module.js';
import { BuildingsModule } from './buildings/buildings.module.js';
import { ComplaintsModule } from './complaints/complaints.module.js';
import { ContactModule } from './contact/contact.module.js';
import { MembershipsModule } from './memberships/memberships.module.js';
import { NoticesModule } from './notices/notices.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HouseholdsModule } from './households/households.module.js';
import { ServiceDirectoryModule } from './service-directory/service-directory.module.js';
import { SocietiesModule } from './societies/societies.module.js';
import { UnitsModule } from './units/units.module.js';
import { UsersModule } from './users/users.module.js';
import { VisitorsModule } from './visitors/visitors.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    GlobalThrottlerModule,
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    UsersModule,
    SocietiesModule,
    BuildingsModule,
    UnitsModule,
    MembershipsModule,
    NoticesModule,
    VisitorsModule,
    BillingModule,
    ComplaintsModule,
    ServiceDirectoryModule,
    HouseholdsModule,
    DashboardModule,
    HealthModule,
    ContactModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

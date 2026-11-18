import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationGuard } from './authorization.guard.js';
import { AuthorizationService } from './authorization.service.js';
import { RbacProbeController } from './rbac-probe.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [RbacProbeController],
  providers: [AuthorizationService, AuthorizationGuard],
  exports: [AuthorizationService, AuthorizationGuard],
})
export class AuthorizationModule {}

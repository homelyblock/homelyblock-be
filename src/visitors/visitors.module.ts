import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { VisitorsController } from './visitors.controller.js';
import { VisitorsService } from './visitors.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [VisitorsController],
  providers: [VisitorsService],
  exports: [VisitorsService],
})
export class VisitorsModule {}

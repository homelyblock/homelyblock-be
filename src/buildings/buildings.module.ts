import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { BuildingsController } from './buildings.controller.js';
import { BuildingsService } from './buildings.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [BuildingsController],
  providers: [BuildingsService],
  exports: [BuildingsService],
})
export class BuildingsModule {}

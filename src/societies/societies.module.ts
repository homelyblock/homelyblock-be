import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { SocietiesController } from './societies.controller.js';
import { SocietiesService } from './societies.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [SocietiesController],
  providers: [SocietiesService],
  exports: [SocietiesService],
})
export class SocietiesModule {}

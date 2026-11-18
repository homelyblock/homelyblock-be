import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { ServiceDirectoryController } from './service-directory.controller.js';
import { ServiceDirectoryService } from './service-directory.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [ServiceDirectoryController],
  providers: [ServiceDirectoryService],
  exports: [ServiceDirectoryService],
})
export class ServiceDirectoryModule {}

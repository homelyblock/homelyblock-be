import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [UsersController],
})
export class UsersModule {}

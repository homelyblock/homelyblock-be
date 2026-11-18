import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import { SignupIntentsController } from './signup-intents.controller.js';
import { SupabaseTokenVerifier } from './supabase-token.verifier.js';
import { TOKEN_VERIFIER } from './auth.types.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [MeController, SignupIntentsController],
  providers: [
    AuthService,
    AuthGuard,
    UsersService,
    {
      provide: TOKEN_VERIFIER,
      useClass: SupabaseTokenVerifier,
    },
  ],
  exports: [AuthService, AuthGuard, UsersService, TOKEN_VERIFIER],
})
export class AuthModule {}

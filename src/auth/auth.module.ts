import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { GoogleStrategy } from './google.strategy.js';
import { GoogleTokenService } from './google-token.service.js';
import { GoogleAuthGuard } from './google-auth.guard.js';
import { StatoOAuthService } from './stato-oauth.service.js';

@Module({
  imports: [PassportModule.register({ session: false })],
  controllers: [AuthController],
  providers: [GoogleStrategy, GoogleTokenService, StatoOAuthService, GoogleAuthGuard],
  // Esportato cosi' altri moduli (es. l'integrazione Google Calendar,
  // quando verra' scritta) possono chiedere un access token valido
  // senza duplicare la logica di refresh.
  exports: [GoogleTokenService],
})
export class AuthModule {}

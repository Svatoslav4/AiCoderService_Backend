import { Module } from '@nestjs/common'
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { GithubStrategy } from './strategies/github.strategies.js'
import { JwtStrategy } from './strategies/jwt.strategies.js'
import { RefreshTokenService } from './refresh-token.service.js'

@Module({
  imports: [
    PassportModule,

    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as JwtSignOptions['expiresIn'],
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    GithubStrategy,
    JwtStrategy,
    RefreshTokenService
  ],

  exports: [AuthService],
})
export class AuthModule {}
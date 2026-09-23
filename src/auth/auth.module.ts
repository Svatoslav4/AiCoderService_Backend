import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
    controllers: [AuthController],
    providers: [AuthController],
    exports: [AuthController]
})
export class AuthModule {}
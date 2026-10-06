import { Injectable } from "@nestjs/common";
import { createHash,randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class RefreshTokenService {
    constructor(private readonly prisma: PrismaService){}
    
    private hashToken(token: string): string {
        return createHash('sha256')
            .update(token)
            .digest('hex')
    }

    async create(userId: string) {
        const token  = randomBytes(64).toString('hex')
        const tokenHash = this.hashToken(token)
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)

        await this.prisma.refreshToken.create({
            data: {
                tokenHash,
                userId,
                expiresAt
            }
        })

        return token 
    }

    async findValidToken(token: string) {
        return this.prisma.refreshToken.findFirst({
            where: {
                tokenHash: this.hashToken(token),
                revokedAt: null,
                expiresAt: { gt: new Date() },
            },
            include: { user: true },
        })
    }

} 
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
        const tokenHash = this.hashToken(token)

        const refreshToken = await this.prisma.refreshToken.findUnique({
            where: {
                tokenHash
            }
        })

        if(!refreshToken) {
            return null
        }

        if(refreshToken.revokedAt) {
            return null
        }

        if(refreshToken.expiresAt < new Date()) {
            return null
        }

        return refreshToken
    }

    async revoke(token: string) {
        const tokenHash = this.hashToken(token)
        await this.prisma.refreshToken.updateMany({
            where: {
                tokenHash,
                revokedAt: null
            },
            data: {
                revokedAt: new Date()
            }
        })
    }
} 
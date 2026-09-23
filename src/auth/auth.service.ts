import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class AuthService {
    constructor(private readonly prisma: PrismaService) {}

    async findUserByGithubId(githubId: string) {
        return this.prisma.user.findUnique({
            where: {
                githubId
            }
        })
    }

    async findUserByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: {
                email
            }
        })
    }
}
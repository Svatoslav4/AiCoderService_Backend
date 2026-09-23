import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { CreateUserDto } from "./dto/create-user.dto.js";

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll() {
        return this.prisma.user.findMany()
    }

    async findById(id: string) {
        return this.prisma.user.findUnique({
            where: {
                id
            }
        })
    }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: {
                email
            }
        })
    }

    async create(createUserDto: CreateUserDto) {
        const existingUser = await this.findByEmail(createUserDto.email)

        if(existingUser) {
            throw new ConflictException('User with this email already exists')
        }

        return this.prisma.user.create({
            data: {
                email: createUserDto.email,
                username: createUserDto.username,
                avatarUrl: ""
            }
        })
    }
}
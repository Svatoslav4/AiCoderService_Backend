import {IsEmail, IsOptional, IsString, MinLength } from 'class-validator'

export class CreateUserDto {
    @IsEmail()
    email: string

    @IsOptional()
    @IsString()
    @MinLength(3)
    username?: string
}

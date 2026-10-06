import { ApiProperty } from "@nestjs/swagger"
import { IsEmail, IsString, MinLength } from "class-validator"

export class CreateUserDto {
    @ApiProperty({
        example: 'John Doe'
    })
    @IsString()
    @MinLength(3)
    name: string
    @ApiProperty({
        example: 'john@doe.com'
    })
    @IsEmail()
    email: string
}

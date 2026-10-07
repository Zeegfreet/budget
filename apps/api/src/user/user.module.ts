import { Module } from '@nestjs/common';
import { UserService } from './user.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

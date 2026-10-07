import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UserModule } from '../user/user.module.js';
import { GroupTransactionController } from './group-transaction.controller.js';
import { GroupTransactionService } from './group-transaction.service.js';
import { GroupController } from './group.controller.js';
import { GroupService } from './group.service.js';
import {
  GroupInvitationController,
  InvitationController,
} from './invitation.controller.js';
import { InvitationService } from './invitation.service.js';
import { SplitMethodController } from './split-method.controller.js';
import { SplitMethodService } from './split-method.service.js';

@Module({
  imports: [PrismaModule, UserModule],
  controllers: [
    GroupController,
    GroupInvitationController,
    InvitationController,
    SplitMethodController,
    GroupTransactionController,
  ],
  providers: [
    GroupService,
    InvitationService,
    SplitMethodService,
    GroupTransactionService,
  ],
})
export class GroupsModule {}

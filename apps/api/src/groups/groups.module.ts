import { Module } from '@nestjs/common';
import { ActivationModule } from '../activation/activation.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UserModule } from '../user/user.module.js';
import { GroupCategoryController } from './group-category.controller.js';
import { GroupCategoryService } from './group-category.service.js';
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
  imports: [PrismaModule, UserModule, ActivationModule],
  controllers: [
    GroupController,
    GroupInvitationController,
    InvitationController,
    SplitMethodController,
    GroupCategoryController,
    GroupTransactionController,
  ],
  providers: [
    GroupService,
    InvitationService,
    SplitMethodService,
    GroupCategoryService,
    GroupTransactionService,
  ],
})
export class GroupsModule {}

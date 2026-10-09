import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateGroup, generatePersonal } from './generate.js';
import { generationTarget, needsGeneration } from './recurrence.js';

const ruleWindow = {
  id: true,
  endMonth: true,
  generatedUntil: true,
} as const;

/**
 * Keeps recurring series filled in: every read of user or group data calls it
 * first with the latest month it shows, and it creates the occurrences still
 * missing up to `generationTarget(month)`. Most calls find nothing to do.
 */
@Injectable()
export class RecurrenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's own rules and those of the groups they are an active member of. */
  async ensureForUser(userId: number, month?: string): Promise<void> {
    const until = generationTarget(month);
    const [own, groups] = await Promise.all([
      this.prisma.recurrence.findMany({
        where: { userId, generatedUntil: { lt: until } },
        select: ruleWindow,
      }),
      this.prisma.groupRecurrence.findMany({
        where: {
          group: { members: { some: { userId, leftAt: null } } },
          generatedUntil: { lt: until },
        },
        select: ruleWindow,
      }),
    ]);
    for (const rule of own.filter((r) => needsGeneration(r, until))) {
      await this.prisma.$transaction((tx) =>
        generatePersonal(tx, rule.id, until),
      );
    }
    for (const rule of groups.filter((r) => needsGeneration(r, until))) {
      await this.prisma.$transaction((tx) => generateGroup(tx, rule.id, until));
    }
  }

  /** Only the group's rules. */
  async ensureForGroup(groupId: number, month?: string): Promise<void> {
    const until = generationTarget(month);
    const rules = await this.prisma.groupRecurrence.findMany({
      where: { groupId, generatedUntil: { lt: until } },
      select: ruleWindow,
    });
    for (const rule of rules.filter((r) => needsGeneration(r, until))) {
      await this.prisma.$transaction((tx) => generateGroup(tx, rule.id, until));
    }
  }
}

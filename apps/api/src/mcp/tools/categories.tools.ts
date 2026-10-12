import { z } from 'zod';
import {
  CreateCategoryDto,
  CreateGroupDto,
  UpdateCategoryDto,
  UpdateGroupDto,
} from '../../budget/dto/category.dto.js';
import { defineTool, id, type ToolContext } from '../tool.js';
import { validateDto } from '../validate-dto.js';
import type { McpServices } from './services.js';

const name = z.string().describe('Name, 1–60 characters (unique in its level)');
const goalPercent = z
  .number()
  .int()
  .describe(
    'Goal as a share of the income, 1–100 percent (expense types only)',
  );

/** The category tree: types (income/expense) and their categories. */
export function registerCategoryTools(ctx: ToolContext, s: McpServices) {
  defineTool(ctx, 'get_categories', {
    scope: 'budget:read',
    title: 'Categorias do orçamento',
    description:
      'Lists the budget category tree: types (kind INCOME or EXPENSE, optional goalPercent for expense types, active flag) and their categories. Inactive items still count in totals but take no new values. Ids returned here are used by the other tools.',
    input: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (_args, userId) => ({
      types: await s.budget.categories(userId),
    }),
  });

  defineTool(ctx, 'create_category_type', {
    scope: 'budget:write',
    title: 'Criar tipo de categoria',
    description:
      'Creates a category type (a group of categories) of kind INCOME or EXPENSE. 409 if the name is already used in that kind.',
    input: {
      kind: z
        .enum(['INCOME', 'EXPENSE'])
        .describe('Income or expense; never changes'),
      name,
      goalPercent: goalPercent.optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (args, userId) => ({
      type: await s.categories.createGroup(
        userId,
        await validateDto(CreateGroupDto, args),
      ),
    }),
  });

  defineTool(ctx, 'update_category_type', {
    scope: 'budget:write',
    title: 'Alterar tipo de categoria',
    description:
      'Renames a category type, activates/inactivates it (active: false hides it but keeps its values) or sets its goal (goalPercent null removes it; set_goals changes several goals at once). The kind cannot change.',
    input: {
      typeId: id('category type'),
      name: name.optional(),
      active: z.boolean().optional(),
      goalPercent: goalPercent.nullable().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async ({ typeId, ...changes }, userId) => ({
      type: await s.categories.updateGroup(
        userId,
        typeId,
        await validateDto(UpdateGroupDto, changes),
      ),
    }),
  });

  defineTool(ctx, 'delete_category_type', {
    scope: 'budget:write',
    title: 'Excluir tipo de categoria',
    description:
      'Deletes a category type with all of its categories and launches. Irreversible; prefer update_category_type with active: false to keep the history.',
    input: { typeId: id('category type') },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async ({ typeId }, userId) => {
      await s.categories.deleteGroup(userId, typeId);
      return { deleted: true };
    },
  });

  defineTool(ctx, 'create_category', {
    scope: 'budget:write',
    title: 'Criar categoria',
    description:
      'Creates a category inside a category type. 409 if the name is already used in that type.',
    input: { typeId: id('category type it belongs to'), name },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async ({ typeId, ...body }, userId) => ({
      category: await s.categories.createCategory(
        userId,
        typeId,
        await validateDto(CreateCategoryDto, body),
      ),
    }),
  });

  defineTool(ctx, 'update_category', {
    scope: 'budget:write',
    title: 'Alterar categoria',
    description:
      'Renames a category or activates/inactivates it (active: false hides it but keeps its values).',
    input: {
      categoryId: id('category'),
      name: name.optional(),
      active: z.boolean().optional(),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async ({ categoryId, ...changes }, userId) => ({
      category: await s.categories.updateCategory(
        userId,
        categoryId,
        await validateDto(UpdateCategoryDto, changes),
      ),
    }),
  });

  defineTool(ctx, 'delete_category', {
    scope: 'budget:write',
    title: 'Excluir categoria',
    description:
      'Deletes a category and all of its launches. Irreversible; prefer update_category with active: false to keep the history.',
    input: { categoryId: id('category') },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async ({ categoryId }, userId) => {
      await s.categories.deleteCategory(userId, categoryId);
      return { deleted: true };
    },
  });
}

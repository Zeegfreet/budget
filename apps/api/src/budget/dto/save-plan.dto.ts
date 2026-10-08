import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
  NotEquals,
  ValidateNested,
} from 'class-validator';
import {
  CreateCategoryDto,
  CreateGroupDto,
  IsPresent,
  UpdateCategoryDto,
  UpdateGroupDto,
} from './category.dto.js';
import { LineCellDto, MAX_CELLS_PER_SAVE } from './save-lines.dto.js';
import {
  CreateTransactionDto,
  UpdateTransactionDto,
} from './transaction.dto.js';

/** Most items of one kind (types, categories, launches) per plan */
export const MAX_PLAN_ITEMS = 200;

const REF_DESCRIPTION =
  'Negative number naming the item created by this plan, for other items to refer to it';
const ID_OR_REF =
  'An existing id, or the `ref` of an item created by this plan';

/** A temporary negative id given by the client to an item it creates */
const IsRef = () =>
  applyDecorators(
    ApiProperty({ example: -1, description: REF_DESCRIPTION }),
    IsInt(),
    Max(-1),
  );

/** An existing id (positive) or a ref (negative) */
const IsIdOrRef = (example: number) =>
  applyDecorators(
    ApiProperty({ example, description: ID_OR_REF }),
    IsInt(),
    NotEquals(0),
  );

/** An existing item's id */
const IsId = () =>
  applyDecorators(ApiProperty({ example: 1 }), IsInt(), Min(1));

/** An optional list of nested items */
const IsItems = (type: () => new () => object) =>
  applyDecorators(
    ApiPropertyOptional({ type: [type()] }),
    IsOptional(),
    IsArray(),
    ArrayMaxSize(MAX_PLAN_ITEMS),
    ValidateNested({ each: true }),
    Type(type),
  );

/** An optional list of existing ids */
const IsIds = (description?: string) =>
  applyDecorators(
    ApiPropertyOptional({ type: [Number], example: [1], description }),
    IsOptional(),
    IsArray(),
    ArrayMaxSize(MAX_PLAN_ITEMS),
    IsInt({ each: true }),
    Min(1, { each: true }),
  );

export class PlanGroupCreateDto extends CreateGroupDto {
  @IsRef()
  ref: number;
}

export class PlanGroupUpdateDto extends UpdateGroupDto {
  @IsId()
  id: number;
}

export class PlanCategoryCreateDto extends CreateCategoryDto {
  @IsRef()
  ref: number;

  @IsIdOrRef(1)
  groupId: number;
}

export class PlanCategoryUpdateDto extends UpdateCategoryDto {
  @IsId()
  id: number;
}

export class PlanLineCreateDto extends OmitType(CreateTransactionDto, [
  'categoryId',
] as const) {
  @IsRef()
  ref: number;

  @IsIdOrRef(1)
  categoryId: number;
}

/** Changes a launch from this occurrence on (`FOLLOWING`). */
export class PlanLineUpdateDto extends OmitType(UpdateTransactionDto, [
  'categoryId',
  'scope',
] as const) {
  @ApiProperty({
    example: 12,
    description: 'The occurrence the change starts from',
  })
  @IsInt()
  @Min(1)
  transactionId: number;

  @ApiPropertyOptional({ example: 1, description: ID_OR_REF })
  @IsPresent()
  @IsInt()
  @NotEquals(0)
  categoryId?: number;
}

export class PlanCellDto extends OmitType(LineCellDto, ['anchorId'] as const) {
  @ApiProperty({
    example: 12,
    description:
      'Any transaction of the line (its `anchorId`), or the `ref` of a launch created by this plan',
  })
  @IsInt()
  @NotEquals(0)
  anchorId: number;
}

/**
 * Body of `PUT /budget/plan`: every change of the dashboard's planning table,
 * saved all or nothing. Items created here get a negative `ref` that later
 * items use in place of an id. Applied in a fixed order (see `PlanService`).
 */
export class SavePlanDto {
  @IsItems(() => PlanGroupCreateDto)
  createGroups?: PlanGroupCreateDto[];

  @IsItems(() => PlanGroupUpdateDto)
  updateGroups?: PlanGroupUpdateDto[];

  @IsIds()
  deleteGroups?: number[];

  @IsItems(() => PlanCategoryCreateDto)
  createCategories?: PlanCategoryCreateDto[];

  @IsItems(() => PlanCategoryUpdateDto)
  updateCategories?: PlanCategoryUpdateDto[];

  @IsIds()
  deleteCategories?: number[];

  @IsItems(() => PlanLineCreateDto)
  createLines?: PlanLineCreateDto[];

  @IsItems(() => PlanLineUpdateDto)
  updateLines?: PlanLineUpdateDto[];

  @IsIds(
    'Occurrences to delete, each with the later pending ones of its series (`FOLLOWING`)',
  )
  deleteLines?: number[];

  @ApiPropertyOptional({ type: [PlanCellDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CELLS_PER_SAVE)
  @ValidateNested({ each: true })
  @Type(() => PlanCellDto)
  cells?: PlanCellDto[];
}

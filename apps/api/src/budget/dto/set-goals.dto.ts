import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_PLAN_ITEMS } from './save-plan.dto.js';

export class GoalChangeDto {
  @ApiProperty({ example: 1, description: 'Expense category type' })
  @IsInt()
  @Min(1)
  typeId: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 50,
    description: 'Share of the income, in percent; `null` removes the goal',
  })
  // Required: `null` is the only way to leave it out
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsInt()
  @Min(1)
  @Max(100)
  goalPercent: number | null;
}

/** Goals of several expense types, set or removed all or nothing. */
export class SetGoalsDto {
  @ApiProperty({ type: [GoalChangeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PLAN_ITEMS)
  @ArrayUnique((goal: GoalChangeDto) => goal?.typeId, {
    message: 'goals must not repeat a type',
  })
  @ValidateNested({ each: true })
  @Type(() => GoalChangeDto)
  goals: GoalChangeDto[];
}

import { BadRequestException } from '@nestjs/common';
import { CreateGroupDto } from '../budget/dto/category.dto.js';
import { SaveLinesDto } from '../budget/dto/save-lines.dto.js';
import { validateDto } from './validate-dto.js';

describe('validateDto', () => {
  it('returns the transformed instance', async () => {
    const dto = await validateDto(CreateGroupDto, {
      kind: 'EXPENSE',
      name: '  Lazer  ',
    });
    expect(dto).toBeInstanceOf(CreateGroupDto);
    expect(dto.name).toBe('Lazer');
  });

  it('throws the 400 the route would, with nested paths', async () => {
    const error = await validateDto(SaveLinesDto, {
      cells: [{ anchorId: 1, month: '2026-13', amountCents: 1 }],
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      message: ['cells.0.month must be a month as YYYY-MM'],
    });
  });

  it('rejects unknown fields like the global pipe', async () => {
    await expect(
      validateDto(CreateGroupDto, { kind: 'EXPENSE', name: 'X', userId: 2 }),
    ).rejects.toMatchObject({
      response: { message: ['property userId should not exist'] },
    });
  });
});

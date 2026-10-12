import { BadRequestException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

/** Messages as the global `ValidationPipe` words them (`cells.0.month …`). */
export function flattenErrors(
  errors: ValidationError[],
  parent?: string,
): string[] {
  return errors.flatMap((error) => {
    const path = parent ? `${parent}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) =>
      parent ? `${parent}.${message}` : message,
    );
    return [...own, ...flattenErrors(error.children ?? [], path)];
  });
}

/**
 * Validates tool arguments with the same DTO (and options) as the REST route,
 * so both enforce one set of rules. Returns the transformed instance (trimmed
 * names, …) or throws the 400 the route would.
 */
export async function validateDto<T extends object>(
  dto: ClassConstructor<T>,
  plain: object,
): Promise<T> {
  const instance = plainToInstance(dto, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length) throw new BadRequestException(flattenErrors(errors));
  return instance;
}

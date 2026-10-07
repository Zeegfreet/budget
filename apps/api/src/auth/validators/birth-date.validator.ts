import { registerDecorator, type ValidationOptions } from 'class-validator';

export const MIN_AGE = 18;
export const MAX_AGE = 120;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses `YYYY-MM-DD` as a UTC calendar date, rejecting impossible dates (e.g. 02-30). */
export function parseIsoDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const match = ISO_DATE.exec(value);
  if (!match) return undefined;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date;
}

/** Completed years between `birth` and `today` (UTC calendar dates). */
export function ageOn(birth: Date, today: Date) {
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday =
    today.getUTCMonth() > birth.getUTCMonth() ||
    (today.getUTCMonth() === birth.getUTCMonth() &&
      today.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age;
}

/** A real `YYYY-MM-DD` date, not in the future, for someone aged MIN_AGE..MAX_AGE. */
export function isValidBirthDate(value: unknown, today = new Date()) {
  const birth = parseIsoDate(value);
  if (!birth || birth > today) return false;
  const age = ageOn(birth, today);
  return age >= MIN_AGE && age <= MAX_AGE;
}

export function IsBirthDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isBirthDate',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `$property must be a valid YYYY-MM-DD date for someone aged ${MIN_AGE} to ${MAX_AGE}`,
        ...options,
      },
      validator: { validate: (value: unknown) => isValidBirthDate(value) },
    });
  };
}

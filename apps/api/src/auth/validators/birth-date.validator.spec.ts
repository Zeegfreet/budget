import {
  ageOn,
  isValidBirthDate,
  parseIsoDate,
} from './birth-date.validator.js';

const today = new Date(Date.UTC(2026, 9, 6)); // 2026-10-06

describe('parseIsoDate', () => {
  it('parses real dates as UTC midnight', () => {
    expect(parseIsoDate('2000-02-29')).toEqual(
      new Date('2000-02-29T00:00:00.000Z'),
    );
  });

  it.each([
    '2001-02-29',
    '2026-02-30',
    '06/10/2026',
    '1990-5-20',
    '1990-05-20T00:00Z',
    19900520,
  ])('rejects %s', (value) => {
    expect(parseIsoDate(value)).toBeUndefined();
  });
});

describe('ageOn', () => {
  it('counts completed years', () => {
    expect(ageOn(new Date(Date.UTC(1990, 9, 7)), today)).toBe(35);
    expect(ageOn(new Date(Date.UTC(1990, 9, 6)), today)).toBe(36);
  });
});

describe('isValidBirthDate', () => {
  it('accepts someone turning 18 today and rejects one day later', () => {
    expect(isValidBirthDate('2008-10-06', today)).toBe(true);
    expect(isValidBirthDate('2008-10-07', today)).toBe(false);
  });

  it.each(['2026-10-07', '1900-01-01', '2026-02-30', '', undefined])(
    'rejects %s',
    (value) => {
      expect(isValidBirthDate(value, today)).toBe(false);
    },
  );
});

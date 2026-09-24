import { isValidNepalPlate, normalizePlate } from './plate.util';

describe('normalizePlate', () => {
  it.each(['ba-99-pa-1234', 'BA 99 PA 1234', 'BA99PA1234', ' Ba 99 Pa 1234 '])('normalizes %p', (v) => {
    expect(normalizePlate(v)).toBe('BA99PA1234');
  });
});

describe('isValidNepalPlate', () => {
  it.each(['BA99PA1234', 'BA1KHA1234', 'LU1PA123', 'GA12CHA9999'])('accepts %p', (v) => {
    expect(isValidNepalPlate(v)).toBe(true);
  });
  it.each(['', '1234', 'BA', 'BA99PA', 'BA99PA12345', '99BAPA1234', 'BA-99-PA-1234'])('rejects %p', (v) => {
    expect(isValidNepalPlate(v)).toBe(false);
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookBusDto, RegisterBusDto } from './buses.dto';

const validPassenger = {
  firstName: 'Anita',
  lastName: 'Rai',
  email: 'anita@example.com',
  phone: '9812345678',
  age: 30,
  gender: 'female',
};

describe('BookBusDto', () => {
  const base = { seats: ['1A'], passengers: [validPassenger], method: 'wallet' };

  it('accepts a valid single-seat booking', async () => {
    const errors = await validate(plainToInstance(BookBusDto, base));
    expect(errors).toHaveLength(0);
  });

  it('rejects seat labels that do not match the row+column format', async () => {
    for (const bad of ['ZZ999', 'A1', '1', '100A']) {
      const errors = await validate(plainToInstance(BookBusDto, { ...base, seats: [bad] }));
      expect(errors.some((e) => e.property === 'seats')).toBe(true);
    }
  });

  it('rejects an empty seat list', async () => {
    const errors = await validate(plainToInstance(BookBusDto, { ...base, seats: [] }));
    expect(errors.some((e) => e.property === 'seats')).toBe(true);
  });

  it('rejects more than 6 seats in one booking', async () => {
    const errors = await validate(
      plainToInstance(BookBusDto, { ...base, seats: ['1A', '1B', '1C', '1D', '2A', '2B', '2C'] }),
    );
    expect(errors.some((e) => e.property === 'seats')).toBe(true);
  });

  it('rejects a payment method outside the allow-list', async () => {
    const errors = await validate(plainToInstance(BookBusDto, { ...base, method: 'bitcoin' }));
    expect(errors.some((e) => e.property === 'method')).toBe(true);
  });
});

describe('RegisterBusDto', () => {
  const base = {
    busName: 'Greenline',
    busNumber: 'GL-1',
    registrationNo: 'BA-1-PA-1234',
    type: 'AC',
    fuelType: 'diesel',
    totalSeats: 40,
    amenities: [],
  };

  it('accepts a valid registration without totalRows', async () => {
    const errors = await validate(plainToInstance(RegisterBusDto, base));
    expect(errors).toHaveLength(0);
  });

  it('rejects totalRows <= 0 (PHASE1_AUDIT: previously unbounded, could self-brick a bus)', async () => {
    for (const totalRows of [0, -1]) {
      const errors = await validate(plainToInstance(RegisterBusDto, { ...base, totalRows }));
      expect(errors.some((e) => e.property === 'totalRows')).toBe(true);
    }
  });

  it('rejects totalSeats outside the 4-80 range', async () => {
    expect(
      (await validate(plainToInstance(RegisterBusDto, { ...base, totalSeats: 2 }))).some((e) => e.property === 'totalSeats'),
    ).toBe(true);
    expect(
      (await validate(plainToInstance(RegisterBusDto, { ...base, totalSeats: 100 }))).some(
        (e) => e.property === 'totalSeats',
      ),
    ).toBe(true);
  });
});

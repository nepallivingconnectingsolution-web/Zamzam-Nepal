import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookBusDto, CreateScheduleDto, RegisterBusDto, UpdateTripStatusDto } from './buses.dto';

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

describe('CreateScheduleDto', () => {
  const base = {
    busId: 'bus_1',
    fromCity: 'Kathmandu',
    toCity: 'Pokhara',
    departureTime: '07:00 AM',
    arrivalTime: '01:30 PM',
    price: 1500,
    frequency: 'once',
    onceDate: '2026-04-01',
  };

  it('accepts a valid one-time schedule', async () => {
    const errors = await validate(plainToInstance(CreateScheduleDto, base));
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid daily schedule with validFrom/validUntil', async () => {
    const { onceDate: _onceDate, ...rest } = base;
    const errors = await validate(
      plainToInstance(CreateScheduleDto, { ...rest, frequency: 'daily', validFrom: '2026-04-01', validUntil: '2026-04-30' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts a valid weekly schedule with operatingDays', async () => {
    const { onceDate: _onceDate, ...rest } = base;
    const errors = await validate(
      plainToInstance(CreateScheduleDto, { ...rest, frequency: 'weekly', operatingDays: [1, 3, 5] }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects a departureTime not in "07:00 AM" 12-hour format', async () => {
    for (const bad of ['19:00', '7:00', '07:00', 'seven am']) {
      const errors = await validate(plainToInstance(CreateScheduleDto, { ...base, departureTime: bad }));
      expect(errors.some((e) => e.property === 'departureTime')).toBe(true);
    }
  });

  it('rejects a non-positive price', async () => {
    const errors = await validate(plainToInstance(CreateScheduleDto, { ...base, price: 0 }));
    expect(errors.some((e) => e.property === 'price')).toBe(true);
  });

  it('rejects a frequency outside once/daily/weekly', async () => {
    const errors = await validate(plainToInstance(CreateScheduleDto, { ...base, frequency: 'monthly' }));
    expect(errors.some((e) => e.property === 'frequency')).toBe(true);
  });

  it('rejects operatingDays values outside 0-6', async () => {
    const { onceDate: _onceDate, ...rest } = base;
    const errors = await validate(
      plainToInstance(CreateScheduleDto, { ...rest, frequency: 'weekly', operatingDays: [7] }),
    );
    expect(errors.some((e) => e.property === 'operatingDays')).toBe(true);
  });

  it('rejects a validFrom/validUntil not in YYYY-MM-DD format', async () => {
    const { onceDate: _onceDate, ...rest } = base;
    const errors = await validate(
      plainToInstance(CreateScheduleDto, { ...rest, frequency: 'daily', validFrom: '04/01/2026' }),
    );
    expect(errors.some((e) => e.property === 'validFrom')).toBe(true);
  });
});

describe('UpdateTripStatusDto', () => {
  it('accepts each valid status', async () => {
    for (const status of ['scheduled', 'cancelled', 'completed']) {
      const errors = await validate(plainToInstance(UpdateTripStatusDto, { status }));
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects a status outside the allow-list', async () => {
    const errors = await validate(plainToInstance(UpdateTripStatusDto, { status: 'delayed' }));
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});

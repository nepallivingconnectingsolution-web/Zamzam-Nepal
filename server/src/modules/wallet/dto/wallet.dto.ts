import { IsIn, IsNumber, Max, Min } from 'class-validator';

/**
 * Top-up request. Amount limits are a first line of defence against typos
 * and abuse; the gateway (eSewa/Khalti) will enforce its own limits once
 * live keys are wired in.
 */
export class TopupDto {
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Amount must be a number with up to 2 decimals.' },
  )
  @Min(10, { message: 'Minimum top-up is NPR 10.' })
  @Max(100000, { message: 'Maximum top-up is NPR 100,000 per transaction.' })
  amount!: number;

  @IsIn(['esewa', 'khalti', 'card'], { message: 'Choose a valid payment method.' })
  method!: 'esewa' | 'khalti' | 'card';
}
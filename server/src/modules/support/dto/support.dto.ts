import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export const TICKET_CATEGORIES = ['payment', 'trip', 'booking', 'account', 'other'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export class CreateTicketDto {
  @IsIn(TICKET_CATEGORIES, { message: 'Choose a valid category.' })
  category!: TicketCategory;

  @IsString()
  @MinLength(10, { message: 'Describe your issue in at least 10 characters.' })
  @MaxLength(1000, { message: 'Keep your description under 1000 characters.' })
  description!: string;
}
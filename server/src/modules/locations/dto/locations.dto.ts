import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchLocationsDto {
  @IsString()
  @MinLength(2, { message: 'Type at least 2 characters to search.' })
  @MaxLength(200)
  q!: string;
}
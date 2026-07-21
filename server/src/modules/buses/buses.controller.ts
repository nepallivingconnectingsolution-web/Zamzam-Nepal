import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BusesService } from './buses.service';
import { BookBusDto, CancelTicketDto, CreateTicketReviewDto } from './dto/buses.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Customer-facing bus search/booking. Search and detail are public (no
 * guard) so unauthenticated visitors can browse before signing in — booking
 * itself requires a logged-in customer.
 */
@Controller('buses')
export class BusesController {
  constructor(private readonly buses: BusesService) {}

  @Get()
  search(@Query('from') from?: string, @Query('to') to?: string, @Query('date') date?: string) {
    return this.buses.search(from, to, date);
  }

  @Get('bookings/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  myBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.buses.myBookings(user.id);
  }

  @Post('bookings/:ticketId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
 cancelBooking(
   @CurrentUser() user: AuthenticatedUser,
   @Param('ticketId') ticketId: string,
   @Body() dto: CancelTicketDto,
 ) {
   return this.buses.cancelBooking(user.id, ticketId, dto);
  }

  @Post('bookings/:ticketId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  submitReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ticketId') ticketId: string,
    @Body() dto: CreateTicketReviewDto,
  ) {
    return this.buses.submitReview(user.id, ticketId, dto);
  }

  @Get('bookings/:ticketId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  myReview(@CurrentUser() user: AuthenticatedUser, @Param('ticketId') ticketId: string) {
    return this.buses.myTicketReview(user.id, ticketId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.buses.detail(id);
  }

  @Post(':id/book')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  book(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: BookBusDto) {
    return this.buses.book(user.id, id, dto);
  }
}
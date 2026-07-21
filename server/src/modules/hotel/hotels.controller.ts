import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { BookRoomDto, CreateReviewDto } from './dto/hotel.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { HotelService } from './hotel.service';

/**
 * Customer-facing hotel search/booking, mirroring BusesController's shape:
 * search and detail are public (no guard) so visitors can browse before
 * signing in; availability checks are also public (needed during browsing,
 * before a booking decision); booking itself requires a logged-in customer.
 */
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotel: HotelService) {}

  @Get()
  search(@Query('city') city?: string) {
    return this.hotel.search(city);
  }

  @Get('bookings/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  myBookings(@CurrentUser() user: AuthenticatedUser) {
    return this.hotel.myBookings(user.id);
  }

  @Post('bookings/:bookingId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  cancelBooking(@CurrentUser() user: AuthenticatedUser, @Param('bookingId') bookingId: string) {
    return this.hotel.cancelBooking(user.id, bookingId);
  }

  @Post('bookings/:bookingId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  submitReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.hotel.submitReview(user.id, bookingId, dto);
  }

  @Get('bookings/:bookingId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  myReview(@CurrentUser() user: AuthenticatedUser, @Param('bookingId') bookingId: string) {
    return this.hotel.myReview(user.id, bookingId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.hotel.detail(id);
  }

  @Get('room-types/:roomTypeId/availability')
  availability(
    @Param('roomTypeId') roomTypeId: string,
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
  ) {
    return this.hotel.availability(roomTypeId, checkIn, checkOut);
  }

  @Post(':id/book')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('customer')
  book(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: BookRoomDto) {
    return this.hotel.book(user.id, id, dto);
  }
}
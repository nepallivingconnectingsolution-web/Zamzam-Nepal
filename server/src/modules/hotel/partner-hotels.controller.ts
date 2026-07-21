import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { HotelService } from './hotel.service';
import { CreateHotelDto, CreateRoomTypeDto, UpdateHotelDto, UpdateRoomTypeDto } from './dto/hotel.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('hotel/hotels')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hotel')
export class PartnerHotelsController {
  constructor(private readonly hotel: HotelService) {}

  @Get()
  myHotels(@CurrentUser() user: AuthenticatedUser) {
    return this.hotel.partnerHotels(user.id);
  }

  @Post()
  createHotel(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateHotelDto) {
    return this.hotel.createHotel(user.id, dto);
  }

  @Patch(':id')
  updateHotel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @Body() dto: UpdateHotelDto,
  ) {
    return this.hotel.updateHotel(user.id, hotelId, dto);
  }

  @Delete(':id')
  deleteHotel(@CurrentUser() user: AuthenticatedUser, @Param('id') hotelId: string) {
    return this.hotel.deleteHotel(user.id, hotelId);
  }

  @Get(':id/room-types')
  roomTypes(@CurrentUser() user: AuthenticatedUser, @Param('id') hotelId: string) {
    return this.hotel.hotelRoomTypes(user.id, hotelId);
  }

  @Post(':id/room-types')
  createRoomType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @Body() dto: CreateRoomTypeDto,
  ) {
    return this.hotel.createRoomType(user.id, hotelId, dto);
  }

  @Patch(':id/room-types/:roomTypeId')
  updateRoomType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @Param('roomTypeId') roomTypeId: string,
    @Body() dto: UpdateRoomTypeDto,
  ) {
    return this.hotel.updateRoomType(user.id, hotelId, roomTypeId, dto);
  }

  @Delete(':id/room-types/:roomTypeId')
  deleteRoomType(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') hotelId: string,
    @Param('roomTypeId') roomTypeId: string,
  ) {
    return this.hotel.deleteRoomType(user.id, hotelId, roomTypeId);
  }

  @Get('bookings/all')
  bookings(@CurrentUser() user: AuthenticatedUser) {
    return this.hotel.partnerBookings(user.id);
  }

  @Get('bookings/:bookingId')
  bookingDetail(@CurrentUser() user: AuthenticatedUser, @Param('bookingId') bookingId: string) {
    return this.hotel.partnerBookingDetail(user.id, bookingId);
  }

  @Get('reviews/all')
  reviews(@CurrentUser() user: AuthenticatedUser) {
    return this.hotel.partnerReviews(user.id);
  }

  @Get('reviews/summary')
  reviewSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.hotel.partnerReviewSummary(user.id);
  }

  @Post('bookings/:bookingId/cancel')
  cancelBooking(@CurrentUser() user: AuthenticatedUser, @Param('bookingId') bookingId: string) {
    return this.hotel.partnerCancelBooking(user.id, bookingId);
  }
}

@Controller('hotel')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hotel')
export class PartnerHotelMetricsController {
  constructor(private readonly hotel: HotelService) {}

  @Get('metrics')
  metrics(@CurrentUser() user: AuthenticatedUser) {
    return this.hotel.metrics(user.id);
  }

  @Get('revenue')
  revenue(@CurrentUser() user: AuthenticatedUser) {
    return this.hotel.partnerRevenue(user.id);
  }
}
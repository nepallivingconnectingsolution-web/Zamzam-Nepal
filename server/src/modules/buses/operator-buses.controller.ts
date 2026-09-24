import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFiles, BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { BusesService } from './buses.service';
import { CreateScheduleDto, RegisterBusDto, UpdateTripStatusDto } from './dto/buses.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

@Controller('operator/buses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('bus_operator')
export class OperatorBusesController {
  constructor(private readonly buses: BusesService) {}

  @Get() fleet(@CurrentUser() user: AuthenticatedUser) { return this.buses.operatorFleet(user.id); }
  @Post() registerBus(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterBusDto) { return this.buses.registerBus(user.id, dto); }
  @Delete(':id') deleteBus(@CurrentUser() user: AuthenticatedUser, @Param('id') busId: string) { return this.buses.deleteBus(user.id, busId); }

  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') busId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Attach at least one photo.');
    return this.buses.addBusPhotos(user.id, busId, files);
  }

  @Delete(':id/photos/:publicId')
  deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') busId: string,
    @Param('publicId') publicId: string,
  ) {
    return this.buses.deleteBusPhoto(user.id, busId, publicId);
  }

  @Get('metrics') metrics(@CurrentUser() user: AuthenticatedUser) { return this.buses.operatorMetrics(user.id); }

  @Get('schedules') schedules(@CurrentUser() user: AuthenticatedUser) { return this.buses.operatorSchedules(user.id); }
  @Post('schedules') createSchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateScheduleDto) { return this.buses.createSchedule(user.id, dto); }
  @Delete('schedules/:id') deleteSchedule(@CurrentUser() user: AuthenticatedUser, @Param('id') scheduleId: string) { return this.buses.deleteSchedule(user.id, scheduleId); }
  @Get('schedules/:id/trips') scheduleTrips(@CurrentUser() user: AuthenticatedUser, @Param('id') scheduleId: string) { return this.buses.scheduleTrips(user.id, scheduleId); }

  @Patch('trips/:id')
  updateTripStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') tripId: string, @Body() dto: UpdateTripStatusDto) {
    return this.buses.updateTripStatus(user.id, tripId, dto.status);
  }

  @Get('bookings') bookings(@CurrentUser() user: AuthenticatedUser) { return this.buses.operatorBookings(user.id); }
  @Get('reviews') reviews(@CurrentUser() user: AuthenticatedUser) { return this.buses.operatorReviews(user.id); }
  @Get('reviews/summary') reviewSummary(@CurrentUser() user: AuthenticatedUser) { return this.buses.operatorReviewSummary(user.id); }
  @Get('revenue') revenue(@CurrentUser() user: AuthenticatedUser) { return this.buses.operatorRevenue(user.id); }
  @Get('routes') routes(@CurrentUser() user: AuthenticatedUser) { return this.buses.operatorRoutes(user.id); }
}
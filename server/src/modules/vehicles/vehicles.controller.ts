import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors, UploadedFiles, BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { VehiclesService } from './vehicles.service';
import { RegisterVehicleDto, UpdateVehicleDto } from './dto/vehicles.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * Driver/transporter vehicle registry — the "get a vehicle into the pool"
 * half of the discovery architecture. Both 'driver' (taxi/bike/parcel) and
 * 'freight' (transporters bidding on loads) roles own vehicles.
 */
@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver', 'freight')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Post()
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterVehicleDto) {
    return this.vehicles.register(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.vehicles.mine(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(user.id, vehicleId, dto);
  }

  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 300_000 } })
  @UseInterceptors(FilesInterceptor('files', 10, { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  uploadPhotos(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Attach at least one photo.');
    return this.vehicles.addVehiclePhotos(user.id, vehicleId, files);
  }

  @Delete(':id/photos/:publicId')
  deletePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') vehicleId: string,
    @Param('publicId') publicId: string,
  ) {
    return this.vehicles.deleteVehiclePhoto(user.id, vehicleId, publicId);
  }

  @Post(':id/activate')
  activate(@CurrentUser() user: AuthenticatedUser, @Param('id') vehicleId: string) {
    return this.vehicles.setActive(user.id, vehicleId);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') vehicleId: string) {
    return this.vehicles.remove(user.id, vehicleId);
  }
}
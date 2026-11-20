import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  imports: [AuthModule],
  controllers: [BookingsController],
  providers: [BookingsService, RolesGuard],
  exports: [BookingsService],
})
export class BookingsModule {}
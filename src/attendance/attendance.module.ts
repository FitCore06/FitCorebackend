import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FitnessModule } from '../fitness/fitness.module.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { StreakChallengeService } from './streak-challenge.service.js';

@Module({
  imports: [AuthModule, FitnessModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, StreakChallengeService, RolesGuard],
  exports: [AttendanceService],
})
export class AttendanceModule {}
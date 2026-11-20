import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { FitnessModule } from '../fitness/fitness.module.js';
import { MembersModule } from '../members/members.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [AssignmentsModule, AttendanceModule, FitnessModule, MembersModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

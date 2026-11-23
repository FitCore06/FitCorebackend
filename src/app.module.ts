import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule as NestCronModule } from '@nestjs/schedule';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { BookingsModule } from './bookings/bookings.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { FitnessModule } from './fitness/fitness.module.js';
import { NutritionModule } from './nutrition/nutrition.module.js';
import { MembersModule } from './members/members.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { GymDirectoryModule } from './gym-directory/gym-directory.module.js';
import { GymOpsModule } from './gym-ops/gym-ops.module.js';
import { TrainersModule } from './trainers/trainers.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { MessagesModule } from './messages/messages.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { ScheduleModule } from './schedule/schedule.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AutomationModule } from './automation/automation.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthController } from './health/health.controller.js';
import { MonitoringModule } from './monitoring/monitoring.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SecurityModule } from './common/security/security.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    NestCronModule.forRoot(),
    SecurityModule,
    PrismaModule,
    AuthModule,
    AssignmentsModule,
    AttendanceModule,
    BookingsModule,
    FeedbackModule,
    MembersModule,
    FitnessModule,
    NutritionModule,
    PaymentsModule,
    GymOpsModule,
    GymDirectoryModule,
    TrainersModule,
    NotificationsModule,
    MessagesModule,
    DashboardModule,
    ScheduleModule,
    AuditModule,
    AutomationModule,
    MonitoringModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
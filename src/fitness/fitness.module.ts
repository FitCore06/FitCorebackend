import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { FitnessController } from './fitness.controller.js';
import { FitnessService } from './fitness.service.js';
import { ExerciseController } from './exercise.controller.js';
import { ExerciseService } from './exercise.service.js';
import { WorkoutPlanController } from './workout-plan.controller.js';
import { WorkoutPlanService } from './workout-plan.service.js';
import { WorkoutSessionController } from './workout-session.controller.js';
import { WorkoutHistoryController } from './workout-history.controller.js';
import { WorkoutRecordsController } from './workout-records.controller.js';
import { WorkoutSessionService } from './workout-session.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    FitnessController,
    ExerciseController,
    WorkoutPlanController,
    WorkoutSessionController,
    WorkoutHistoryController,
    WorkoutRecordsController,
  ],
  providers: [
    FitnessService,
    ExerciseService,
    WorkoutPlanService,
    WorkoutSessionService,
    RolesGuard,
  ],
  exports: [FitnessService, ExerciseService, WorkoutPlanService, WorkoutSessionService],
})
export class FitnessModule {}

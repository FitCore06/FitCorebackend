import { Module } from '@nestjs/common';
import { GymOpsController } from './gym-ops.controller.js';
import { GymOpsService } from './gym-ops.service.js';

@Module({
  controllers: [GymOpsController],
  providers: [GymOpsService],
})
export class GymOpsModule {}
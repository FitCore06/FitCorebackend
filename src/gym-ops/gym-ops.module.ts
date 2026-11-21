import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module.js';
import { GymOpsController } from './gym-ops.controller.js';
import { GymOpsService } from './gym-ops.service.js';

@Module({
  imports: [AutomationModule],
  controllers: [GymOpsController],
  providers: [GymOpsService],
})
export class GymOpsModule {}
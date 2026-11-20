import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, RolesGuard],
  exports: [FeedbackService],
})
export class FeedbackModule {}
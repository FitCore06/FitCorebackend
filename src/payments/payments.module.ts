import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { PaymentsController } from './payments.controller.js';
import { RazorpayWebhookController } from './razorpay-webhook.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [PaymentsController, RazorpayWebhookController],
  providers: [PaymentsService, RolesGuard],
})
export class PaymentsModule {}
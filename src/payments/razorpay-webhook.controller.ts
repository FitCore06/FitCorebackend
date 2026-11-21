import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service.js';

type RawBodyRequest = Request & { body: Buffer };

@ApiTags('payments')
@Controller('payments/razorpay')
export class RazorpayWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Razorpay payment webhook (no JWT)' })
  handleWebhook(
    @Req() req: RawBodyRequest,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ) {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {});
    if (!signature?.trim()) {
      throw new BadRequestException('Missing X-Razorpay-Signature');
    }
    return this.payments.handleRazorpayWebhook(rawBody, signature.trim());
  }
}
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { CreateRefundDto } from './dto/create-refund.dto.js';
import { MemberPaymentRequestDto } from './dto/member-payment-request.dto.js';
import { RazorpayOrderDto } from './dto/razorpay-order.dto.js';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto.js';
import { PaymentsService } from './payments.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles(Role.GYM_ADMIN)
  list(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    if (!gymSlug?.trim()) return [];
    return this.payments.listForGym(req.user, gymSlug.trim());
  }

  @Get('me')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Paid receipts for logged-in member' })
  myReceipts(@Req() req: AuthedRequest) {
    return this.payments.listForMember(req.user);
  }

  @Get('me/items')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Paid and pending payments for logged-in member' })
  myPaymentItems(@Req() req: AuthedRequest) {
    return this.payments.listMyPaymentItems(req.user);
  }

  @Post('me/request')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Submit UPI/bank payment for owner approval' })
  submitMemberPayment(@Req() req: AuthedRequest, @Body() dto: MemberPaymentRequestDto) {
    return this.payments.submitMemberPaymentRequest(req.user, dto);
  }

  @Get('proof/:id')
  @Roles(Role.GYM_ADMIN, Role.MEMBER)
  paymentProof(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.payments.paymentProofDataUrl(req.user, id);
  }

  @Post()
  @Roles(Role.GYM_ADMIN)
  create(@Req() req: AuthedRequest, @Body() dto: CreatePaymentDto) {
    return this.payments.create(req.user, dto);
  }

  @Post('razorpay/order')
  @Roles(Role.MEMBER)
  @ApiOperation({ summary: 'Create Razorpay order (test or live keys)' })
  razorpayOrder(@Req() req: AuthedRequest, @Body() dto: RazorpayOrderDto) {
    return this.payments.createRazorpayOrder(req.user, dto);
  }

  @Post(':id/refunds')
  @Roles(Role.GYM_ADMIN)
  refund(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CreateRefundDto,
  ) {
    return this.payments.refund(req.user, id, dto);
  }

  @Patch(':id/status')
  @Roles(Role.GYM_ADMIN)
  patchStatus(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.payments.updateStatus(req.user, id, dto.status);
  }
}

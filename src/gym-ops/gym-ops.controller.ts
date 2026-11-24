import {
  Body,
  Controller,
  Delete,
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
import { CreateBranchDto } from './dto/create-branch.dto.js';
import { UpdateBranchDto, BranchGrantDto } from './dto/update-branch.dto.js';
import { CreateCrmLeadDto } from './dto/create-crm-lead.dto.js';
import { CreateEquipmentDto } from './dto/create-equipment.dto.js';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto.js';
import { CreateOtherExpenseDto } from './dto/create-other-expense.dto.js';
import { CreateSupplementSaleDto } from './dto/create-supplement-sale.dto.js';
import { CreateTrialLeadDto } from './dto/create-trial-lead.dto.js';
import { AssignMembershipDto, RenewMembershipDto } from './dto/assign-membership.dto.js';
import { UpdateCrmLeadDto } from './dto/update-crm-lead.dto.js';
import { UpdateEquipmentDto } from './dto/update-equipment.dto.js';
import { UpdatePaymentCollectionDto } from './dto/update-payment-collection.dto.js';
import { GymOpsService } from './gym-ops.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('gym-ops')
@Controller('gym-ops')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class GymOpsController {
  constructor(private readonly ops: GymOpsService) {}

  @Get('memberships/plans')
  @Roles(Role.GYM_ADMIN, Role.MEMBER)
  @ApiOperation({
    summary:
      'Gym membership plans (owner sees active counts; members see catalog to purchase)',
  })
  plans(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.membershipPlans(req.user, gymSlug);
  }

  @Get('memberships/plans/member')
  @Roles(Role.MEMBER)
  @ApiOperation({
    summary: 'Alias: all gym membership plans for members',
  })
  memberPlanCatalog(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.membershipPlanCatalogForMember(req.user, gymSlug.trim());
  }

  @Post('memberships/plans')
  @Roles(Role.GYM_ADMIN)
  createPlan(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateMembershipPlanDto,
  ) {
    return this.ops.createMembershipPlan(req.user, gymSlug, dto);
  }

  @Patch('memberships/plans/:planId')
  @Roles(Role.GYM_ADMIN)
  updatePlan(
    @Req() req: AuthedRequest,
    @Param('planId') planId: string,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateMembershipPlanDto,
  ) {
    return this.ops.updateMembershipPlan(req.user, gymSlug, planId, dto);
  }

  @Delete('memberships/plans/:planId')
  @Roles(Role.GYM_ADMIN)
  deletePlan(
    @Req() req: AuthedRequest,
    @Param('planId') planId: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.deleteMembershipPlan(req.user, gymSlug, planId);
  }

  @Get('trainer-memberships/plans')
  @Roles(Role.GYM_ADMIN)
  trainerPlans(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.trainerMembershipPlans(req.user, gymSlug);
  }

  @Post('trainer-memberships/plans')
  @Roles(Role.GYM_ADMIN)
  createTrainerPlan(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateMembershipPlanDto,
  ) {
    return this.ops.createTrainerMembershipPlan(req.user, gymSlug, dto);
  }

  @Patch('trainer-memberships/plans/:planId')
  @Roles(Role.GYM_ADMIN)
  updateTrainerPlan(
    @Req() req: AuthedRequest,
    @Param('planId') planId: string,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateMembershipPlanDto,
  ) {
    return this.ops.updateTrainerMembershipPlan(req.user, gymSlug, planId, dto);
  }

  @Delete('trainer-memberships/plans/:planId')
  @Roles(Role.GYM_ADMIN)
  deleteTrainerPlan(
    @Req() req: AuthedRequest,
    @Param('planId') planId: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.deleteTrainerMembershipPlan(req.user, gymSlug, planId);
  }

  @Get('memberships/active')
  @Roles(Role.GYM_ADMIN)
  active(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.activeMemberships(req.user, gymSlug);
  }

  @Post('memberships/assign')
  @Roles(Role.GYM_ADMIN)
  assignMembership(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: AssignMembershipDto,
  ) {
    return this.ops.assignMembership(req.user, gymSlug, dto);
  }

  @Post('memberships/:membershipId/renew')
  @Roles(Role.GYM_ADMIN)
  renewMembership(
    @Req() req: AuthedRequest,
    @Param('membershipId') membershipId: string,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: RenewMembershipDto,
  ) {
    return this.ops.renewMembership(req.user, gymSlug, membershipId, dto);
  }

  @Post('memberships/reminders/run')
  @Roles(Role.GYM_ADMIN)
  runMembershipReminders(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.runMembershipReminders(req.user, gymSlug);
  }

  @Post('memberships/expiry-automation/run')
  @Roles(Role.GYM_ADMIN)
  runMembershipExpiryAutomation(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Query('days') days?: string,
  ) {
    return this.ops.runMembershipExpiryAutomation(req.user, gymSlug, days);
  }

  @Get('trials')
  @Roles(Role.GYM_ADMIN)
  trials(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.trials(req.user, gymSlug);
  }

  @Post('trials')
  @Roles(Role.GYM_ADMIN)
  createTrial(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateTrialLeadDto,
  ) {
    return this.ops.createTrial(req.user, gymSlug, dto);
  }

  @Get('crm')
  @Roles(Role.GYM_ADMIN)
  crm(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.crm(req.user, gymSlug);
  }

  @Post('crm')
  @Roles(Role.GYM_ADMIN)
  createCrm(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateCrmLeadDto,
  ) {
    return this.ops.createCrmLead(req.user, gymSlug, dto);
  }

  @Patch('crm/:id')
  @Roles(Role.GYM_ADMIN)
  updateCrm(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: UpdateCrmLeadDto,
  ) {
    return this.ops.updateCrmLead(req.user, gymSlug, id, dto);
  }

  @Get('equipment')
  @Roles(Role.GYM_ADMIN, Role.MEMBER)
  equipment(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug?: string,
  ) {
    if (gymSlug?.trim()) return this.ops.equipment(req.user, gymSlug.trim());
    return this.ops.equipmentForMember(req.user);
  }

  @Post('equipment')
  @Roles(Role.GYM_ADMIN)
  createEquipment(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateEquipmentDto,
  ) {
    return this.ops.createEquipment(req.user, gymSlug, dto);
  }

  @Patch('equipment/:id')
  @Roles(Role.GYM_ADMIN)
  updateEquipment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: UpdateEquipmentDto,
  ) {
    return this.ops.updateEquipment(req.user, gymSlug, id, dto);
  }

  @Delete('equipment/:id')
  @Roles(Role.GYM_ADMIN)
  deleteEquipment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.deleteEquipment(req.user, gymSlug, id);
  }

  @Get('payroll')
  @Roles(Role.GYM_ADMIN, Role.TRAINER)
  payroll(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.payroll(req.user, gymSlug);
  }

  @Post('payroll/compute')
  @Roles(Role.GYM_ADMIN)
  computePayroll(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Query('period') period?: string,
  ) {
    const label =
      period?.trim() ||
      new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return this.ops.computePayroll(req.user, gymSlug, label);
  }

  @Get('automation')
  @Roles(Role.GYM_ADMIN)
  automation(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.listAutomationRules(req.user, gymSlug);
  }

  @Patch('automation/:id/toggle')
  @Roles(Role.GYM_ADMIN)
  toggleAutomation(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.toggleAutomation(req.user, gymSlug, id);
  }

  @Get('reports')
  @Roles(Role.GYM_ADMIN)
  reports(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.reports(req.user, gymSlug);
  }

  @Get('reports/:id/download')
  @Roles(Role.GYM_ADMIN)
  downloadReport(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
    @Query('format') format?: string,
  ) {
    return this.ops.downloadReport(req.user, gymSlug, id, format);
  }

  @Get('finance')
  @Roles(Role.GYM_ADMIN)
  finance(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.finance(req.user, gymSlug);
  }

  @Get('other-expenses')
  @Roles(Role.GYM_ADMIN)
  listOtherExpenses(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.otherExpenses(req.user, gymSlug);
  }

  @Post('other-expenses')
  @Roles(Role.GYM_ADMIN)
  createOtherExpense(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateOtherExpenseDto,
  ) {
    return this.ops.createOtherExpense(req.user, gymSlug, dto);
  }

  @Get('other-expenses/:id/proof')
  @Roles(Role.GYM_ADMIN)
  otherExpenseProof(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.otherExpenseProof(req.user, gymSlug, id);
  }

  @Get('supplement-sales')
  @Roles(Role.GYM_ADMIN)
  supplementSales(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.supplementSales(req.user, gymSlug);
  }

  @Post('supplement-sales')
  @Roles(Role.GYM_ADMIN)
  createSupplementSale(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateSupplementSaleDto,
  ) {
    return this.ops.createSupplementSale(req.user, gymSlug, dto);
  }

  @Get('supplement-sales/:id/proof')
  @Roles(Role.GYM_ADMIN)
  supplementSaleProof(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.supplementSaleProof(req.user, gymSlug, id);
  }

  @Post('supplement-sales/:id/resend-whatsapp')
  @Roles(Role.GYM_ADMIN)
  resendSupplementBill(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.resendSupplementBillWhatsApp(req.user, gymSlug, id);
  }

  @Post('supplement-sales/:id/resend-bill')
  @Roles(Role.GYM_ADMIN)
  resendSupplementBillSms(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.resendSupplementBillWhatsApp(req.user, gymSlug, id);
  }

  @Get('branches')
  @Roles(Role.GYM_ADMIN)
  branches(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.branches(req.user, gymSlug);
  }

  @Post('branches')
  @Roles(Role.GYM_ADMIN)
  createBranch(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.ops.createBranch(req.user, gymSlug, dto);
  }

  @Patch('branches/:branchId')
  @Roles(Role.GYM_ADMIN)
  updateBranch(
    @Req() req: AuthedRequest,
    @Param('branchId') branchId: string,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.ops.updateBranch(req.user, gymSlug, branchId, dto);
  }

  @Get('branches/:branchId/grants')
  @Roles(Role.GYM_ADMIN)
  listBranchGrants(
    @Req() req: AuthedRequest,
    @Param('branchId') branchId: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.listBranchGrants(req.user, gymSlug, branchId);
  }

  @Post('branches/:branchId/grants')
  @Roles(Role.GYM_ADMIN)
  grantBranchAccess(
    @Req() req: AuthedRequest,
    @Param('branchId') branchId: string,
    @Query('gymSlug') gymSlug: string,
    @Body() dto: BranchGrantDto,
  ) {
    return this.ops.grantBranchAccess(req.user, gymSlug, branchId, dto);
  }

  @Delete('branches/:branchId/grants/:userId')
  @Roles(Role.GYM_ADMIN)
  revokeBranchAccess(
    @Req() req: AuthedRequest,
    @Param('branchId') branchId: string,
    @Param('userId') userId: string,
    @Query('gymSlug') gymSlug: string,
  ) {
    return this.ops.revokeBranchAccess(req.user, gymSlug, branchId, userId);
  }

  @Get('payment-collection')
  @Roles(Role.GYM_ADMIN, Role.MEMBER)
  paymentCollection(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.getPaymentCollection(req.user, gymSlug);
  }

  @Get('settings')
  @Roles(Role.GYM_ADMIN)
  settings(@Req() req: AuthedRequest, @Query('gymSlug') gymSlug: string) {
    return this.ops.settings(req.user, gymSlug);
  }

  @Patch('settings/payment-collection')
  @Roles(Role.GYM_ADMIN)
  updatePaymentCollection(
    @Req() req: AuthedRequest,
    @Query('gymSlug') gymSlug: string,
    @Body() body: UpdatePaymentCollectionDto,
  ) {
    return this.ops.updatePaymentCollection(req.user, gymSlug, body);
  }
}

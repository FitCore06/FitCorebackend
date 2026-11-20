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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthUserPayload } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { Role, Roles, RolesGuard } from '../auth/guards/roles.guard.js';
import { CreateNutritionScanDto } from './dto/create-nutrition-scan.dto.js';
import { ManualIntakeDto } from './dto/manual-intake.dto.js';
import { PatchScanItemsDto } from './dto/patch-scan-items.dto.js';
import { FoodCatalogService } from './food-catalog.service.js';
import { NutritionHistoryService } from './nutrition-history.service.js';
import { NutritionScannerService } from './nutrition-scanner.service.js';

type AuthedRequest = Request & { user: AuthUserPayload };

@ApiTags('nutrition')
@Controller('nutrition')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class NutritionController {
  constructor(
    private readonly scanner: NutritionScannerService,
    private readonly nutritionHistory: NutritionHistoryService,
    private readonly catalog: FoodCatalogService,
  ) {}

  @Get('capabilities')
  @Roles(Role.MEMBER)
  capabilities(@Req() req: AuthedRequest) {
    return this.scanner.capabilities(req.user);
  }

  @Post('scans')
  @Roles(Role.MEMBER)
  createScan(@Req() req: AuthedRequest, @Body() dto: CreateNutritionScanDto) {
    return this.scanner.createScan(req.user, dto);
  }

  @Get('scans/:id')
  @Roles(Role.MEMBER)
  getScan(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.scanner.getScan(req.user, id);
  }

  @Patch('scans/:id/items')
  @Roles(Role.MEMBER)
  patchItems(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: PatchScanItemsDto,
  ) {
    return this.scanner.patchItems(req.user, id, dto);
  }

  @Post('scans/:id/confirm')
  @Roles(Role.MEMBER)
  confirmScan(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.scanner.confirmScan(req.user, id);
  }

  @Delete('scans/:id')
  @Roles(Role.MEMBER)
  discardScan(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.scanner.discardScan(req.user, id);
  }

  @Post('intake/manual')
  @Roles(Role.MEMBER)
  manualIntake(@Req() req: AuthedRequest, @Body() dto: ManualIntakeDto) {
    return this.scanner.manualIntake(req.user, dto);
  }

  @Get('daily-summary')
  @Roles(Role.MEMBER)
  dailySummary(@Req() req: AuthedRequest, @Query('date') date?: string) {
    const logDate = date?.trim() || new Date().toISOString().slice(0, 10);
    return this.nutritionHistory.dailySummary(req.user, logDate);
  }

  @Get('history')
  @Roles(Role.MEMBER)
  listHistory(
    @Req() req: AuthedRequest,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.nutritionHistory.history(req.user, from, to, cursor);
  }

  @Get('foods/search')
  @Roles(Role.MEMBER)
  async searchFoods(
    @Req() req: AuthedRequest,
    @Query('q') q: string,
    @Query('localLimit') localLimit?: string,
    @Query('usdaLimit') usdaLimit?: string,
  ) {
    const memberRole = req.user.roles.find((r) => r.role === Role.MEMBER);
    const gymId = memberRole?.gymId ?? '';
    const local = Math.min(Math.max(Number(localLimit) || 30, 1), 50);
    const usda = Math.min(Math.max(Number(usdaLimit) || 50, 1), 50);
    return this.catalog.search(q ?? '', gymId, local, usda);
  }

  @Get('barcode/:code')
  @Roles(Role.MEMBER)
  barcodeLookup() {
    return {
      available: false,
      message: 'Barcode lookup ships in P4 (Open Food Facts)',
    };
  }
}
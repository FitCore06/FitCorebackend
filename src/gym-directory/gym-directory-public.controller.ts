import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { SubmitDirectoryReviewDto } from './dto/submit-directory-review.dto.js';
import { GymDirectoryService } from './gym-directory.service.js';

@ApiTags('public-gym-directory')
@Controller('public/gym-directory')
export class GymDirectoryPublicController {
  constructor(private readonly directory: GymDirectoryService) {}

  @Get('states')
  listStates() {
    return this.directory.listStates();
  }

  @Get('cities')
  listCities(@Query('state') state?: string) {
    return this.directory.listCities(state);
  }

  @Get('gyms')
  listGyms(
    @Query('state') state?: string,
    @Query('city') city?: string,
    @Query('q') q?: string,
  ) {
    return this.directory.listGyms({ state, city, q });
  }

  @Get('gyms/:slug')
  gymBySlug(@Param('slug') slug: string) {
    return this.directory.gymBySlug(slug);
  }

  @Post('gyms/:slug/reviews')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  submitReview(@Param('slug') slug: string, @Body() dto: SubmitDirectoryReviewDto) {
    return this.directory.submitReview(slug, dto);
  }
}
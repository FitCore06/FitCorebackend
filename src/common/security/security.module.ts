import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './app-throttler.guard.js';
import { SecurityEventsService } from './security-events.service.js';

const apiLimit = Number(process.env.API_THROTTLE_LIMIT ?? 300);

@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60_000, limit: apiLimit },
        { name: 'auth', ttl: 60_000, limit: 100 },
      ],
    }),
  ],
  providers: [
    SecurityEventsService,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
  exports: [SecurityEventsService, ThrottlerModule],
})
export class SecurityModule {}
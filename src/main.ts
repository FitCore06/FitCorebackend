import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';

function normalizeSupabaseRuntimePool() {
  if (process.env.NODE_ENV !== 'production' || !process.env.DATABASE_URL) {
    return;
  }

  const databaseUrl = new URL(process.env.DATABASE_URL);
  if (
    databaseUrl.hostname.endsWith('.pooler.supabase.com') &&
    databaseUrl.port === '5432'
  ) {
    databaseUrl.port = '6543';
    databaseUrl.searchParams.set('pgbouncer', 'true');
    databaseUrl.searchParams.set('connection_limit', '10');
    databaseUrl.searchParams.set('pool_timeout', '30');
    process.env.DATABASE_URL = databaseUrl.toString();
  }
}

async function bootstrap() {
  normalizeSupabaseRuntimePool();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(
    '/api/v1/payments/razorpay/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
  );
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const corsOrigins =
    config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000';
  app.enableCors({
    origin: corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FitCore API')
    .setDescription('Multi-tenant gym management platform')
    .setVersion('0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? config.get<string>('PORT') ?? 3001);
  await app.listen(port, '0.0.0.0');
}
await bootstrap();

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

function corsAllowedOrigins(config: ConfigService): string[] {
  const listed =
    config.get<string>('CORS_ORIGINS')?.trim() ||
    config.get<string>('ATHRA_CORS_ORIGINS')?.trim() ||
    config.get<string>('FITCORE_CORS_ORIGINS')?.trim() ||
    'http://localhost:3000';
  const appPublic = config.get<string>('APP_PUBLIC_URL')?.trim();
  const origins = new Set(
    listed
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
  if (appPublic) {
    origins.add(appPublic);
  }
  return [...origins];
}

function corsAllowsVercelPreviews(config: ConfigService): boolean {
  const flag = config.get<string>('CORS_ALLOW_VERCEL_APPS')?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') {
    return false;
  }
  if (flag === 'true' || flag === '1' || flag === 'yes') {
    return true;
  }
  return process.env.NODE_ENV === 'production';
}

function isVercelAppOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' && url.hostname.endsWith('.vercel.app')
    );
  } catch {
    return false;
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

  const allowedOrigins = corsAllowedOrigins(config);
  const allowVercelApps = corsAllowsVercelPreviews(config);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (
        allowedOrigins.includes(origin) ||
        (allowVercelApps && isVercelAppOrigin(origin))
      ) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Athra API')
    .setDescription('Multi-tenant gym management platform')
    .setVersion('0.0.1')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? config.get<string>('PORT') ?? 3001);
  await app.listen(port, '0.0.0.0');
}
await bootstrap();

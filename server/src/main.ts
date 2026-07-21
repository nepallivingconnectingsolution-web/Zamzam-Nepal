import 'reflect-metadata';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ensureDriverDocumentsDir } from './modules/driver-documents/storage';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Fail fast if production is about to run with placeholder or weak JWT
  // secrets from .env.example — otherwise anyone can forge valid tokens.
  if ((config.get<string>('NODE_ENV') ?? 'development') === 'production') {
    const weak = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'SUPER_ADMIN_JWT_SECRET'].filter((key) => {
      const v = config.get<string>(key) ?? '';
      return v.length < 32 || v.startsWith('replace-with');
    });
    if (weak.length > 0) {
      throw new Error(
        `Refusing to start in production with weak/placeholder secrets: ${weak.join(', ')}. ` +
          'Generate strong values, e.g. `openssl rand -base64 48`.',
      );
    }
  }

 // crossOriginResourcePolicy is relaxed to 'cross-origin' — otherwise the
  // frontend (a different origin in dev, e.g. localhost:5173) can fetch
  // /uploads/* files but the browser silently refuses to *render* them
  // (e.g. an <img> preview of an uploaded document) because of the
  // same-origin CORP default.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Driver-uploaded identity documents (citizenship/license/NID) — see
  // modules/driver-documents. Stored on local disk and served back out at
  // this public prefix; filenames are random ids, so treat links as
  // unlisted rather than access-controlled (see storage.ts).
  ensureDriverDocumentsDir();
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Ensures NestJS lifecycle hooks (OnModuleDestroy / beforeApplicationShutdown)
  // actually run on SIGTERM/SIGINT — this is the direct fix for the
  // "missing shutdown hooks" half of this project's earlier heap-out-of-memory
  // incident. Without this call, the process can be killed (by a deploy,
  // by Docker, by Ctrl+C) while pg pool connections are still open,
  // leaking connections across restarts until Neon's connection limit is hit.
  app.enableShutdownHooks();

  const port = Number(config.get('PORT') ?? 4000);
  await app.listen(port);
  logger.log(`Zamzam server listening on port ${port}`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});

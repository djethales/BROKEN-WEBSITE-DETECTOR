import 'reflect-metadata';
import './load-dotenv';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { getEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(','),
  });
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API en écoute sur le port ${env.PORT}`, 'Bootstrap');
}

void bootstrap();

import 'reflect-metadata';
import './load-dotenv';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  await NestFactory.createApplicationContext(WorkerModule);
  Logger.log('Worker prêt', 'Bootstrap');
}

void bootstrap();

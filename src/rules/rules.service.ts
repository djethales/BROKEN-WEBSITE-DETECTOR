import { readFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { rulesFileSchema, type ErrorRule } from './rules.schema';

@Injectable()
export class RulesService implements OnModuleInit {
  private compiled: ErrorRule[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {}

  onModuleInit(): void {
    const path = isAbsolute(this.env.RULES_FILE)
      ? this.env.RULES_FILE
      : join(process.cwd(), this.env.RULES_FILE);
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    this.compiled = rulesFileSchema.parse(parsed);
  }

  getRules(): ErrorRule[] {
    return this.compiled;
  }
}

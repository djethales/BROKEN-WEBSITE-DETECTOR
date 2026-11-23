import type { InputJsonValue } from '@prisma/client/runtime/library';

export function toJson(value: unknown): InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as InputJsonValue;
}

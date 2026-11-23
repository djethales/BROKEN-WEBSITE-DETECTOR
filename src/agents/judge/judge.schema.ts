import { z } from 'zod';
import { INCIDENT_TYPES } from '../../common/types';

export const judgeResponseSchema = z.object({
  verdict: z.enum(['HEALTHY', 'BROKEN', 'DOUBTFUL']),
  type: z.enum(INCIDENT_TYPES).optional(),
  reason: z.string().min(1).max(500),
  suggestedRule: z
    .object({
      id: z.string().optional(),
      source: z.string().optional(),
      textMatch: z.string().optional(),
      urlMatch: z.string().optional(),
      verdict: z.enum(['BROKEN', 'DOUBTFUL', 'IGNORE']).optional(),
      incidentType: z.enum(INCIDENT_TYPES).optional(),
    })
    .nullable()
    .optional(),
});

export type JudgeResponse = z.infer<typeof judgeResponseSchema>;

export function parseJudgeResponse(raw: string): JudgeResponse | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    const result = judgeResponseSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

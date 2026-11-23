import { z } from 'zod';
import { INCIDENT_TYPES } from '../common/types';

export const errorRuleSchema = z
  .object({
    id: z.string().min(1),
    description: z.string().min(1),
    source: z.enum(['console', 'pageerror', 'network', 'dom', '*']),
    resourceType: z.string().optional(),
    urlMatch: z.string().optional(),
    textMatch: z.string().optional(),
    statusMatch: z.string().optional(),
    firstPartyOnly: z.boolean().optional(),
    minCount: z.number().int().positive().optional(),
    domCheck: z.enum(['visibleTextTooShort', 'stylesheetsDeclaredButEmpty']).optional(),
    verdict: z.enum(['IGNORE', 'DOUBTFUL', 'BROKEN']),
    incidentType: z.enum(INCIDENT_TYPES).optional(),
  })
  .superRefine((rule, ctx) => {
    if (rule.verdict === 'BROKEN' && !rule.incidentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${rule.id}: incidentType requis pour un verdict BROKEN`,
      });
    }
    for (const pattern of [rule.urlMatch, rule.textMatch, rule.statusMatch]) {
      if (!pattern) {
        continue;
      }
      try {
        new RegExp(pattern, 'i');
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${rule.id}: expression régulière invalide`,
        });
      }
    }
  });

export const rulesFileSchema = z.array(errorRuleSchema).min(1);

export type ErrorRule = z.infer<typeof errorRuleSchema>;

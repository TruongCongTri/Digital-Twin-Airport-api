import { z } from 'zod';
import { MESSAGES } from '@/constants/messages';
import { FIELDS } from '@/constants/fields';

const DEMO_SCENARIOS = [
  'NONE', // Used to gracefully stop an active scenario
  'TROPICAL_SQUALL',
  'TARMAC_OVERHEAT',
  'AC_FAILURE',
  'HEAVY_LOAD',
  'EARTHQUAKE',
] as const;

export const triggerScenarioSchema = z.object({
  body: z.object({
    scenario: z.enum(DEMO_SCENARIOS, {
      message: MESSAGES.VALIDATION.INVALID_ENUM(FIELDS.TITLE),
    }),
  }),
});

export type TriggerScenarioDTO = z.infer<typeof triggerScenarioSchema>['body'];

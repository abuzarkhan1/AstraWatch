import { z } from 'zod';

export const subscribeMetricsSchema = z.object({
  type: z.literal('subscribe:metrics'),
  payload: z.object({
    clusterId: z.string().optional(),
    serviceId: z.string().optional(),
  }),
});

export const subscribeIncidentsSchema = z.object({
  type: z.literal('subscribe:incidents'),
  payload: z.object({
    severity: z.string().optional(),
    status: z.string().optional(),
  }),
});

export const clientEventSchema = z.union([
  subscribeMetricsSchema,
  subscribeIncidentsSchema,
]);

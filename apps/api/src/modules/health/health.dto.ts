import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const healthStatusSchema = z.strictObject({
  status: z.literal('ok'),
});

export class HealthStatusDto extends createZodDto(healthStatusSchema) {}

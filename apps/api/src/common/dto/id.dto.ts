import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** The ID of a newly created resource. */
export class IdDto extends createZodDto(z.strictObject({ id: z.uuid() })) {}

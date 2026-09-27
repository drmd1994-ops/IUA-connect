import { errorEnvelopeSchema } from '@iua/shared';
import { createZodDto } from 'nestjs-zod';

/** OpenAPI description of the error envelope (API_DESIGN.md §2), for @Api*Response decorators. */
export class ErrorEnvelopeDto extends createZodDto(errorEnvelopeSchema) {}

import { z } from 'zod';

/**
 * A string or null in a response. A bare `z.string().nullable()` becomes
 * `type: ["string", "null"]` in the OpenAPI document, which @nestjs/swagger misreads as an
 * array; any constraint (here a generous length limit) makes it an `anyOf` that clients read
 * correctly.
 */
export const nullableString = () => z.string().max(100_000).nullable();

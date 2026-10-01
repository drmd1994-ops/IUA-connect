import { z } from 'zod';

/**
 * A string or null in a response. A bare `z.string().nullable()` becomes
 * `type: ["string", "null"]` in the OpenAPI document, which @nestjs/swagger misreads as an
 * array; any constraint (here a generous length limit) makes it an `anyOf` that clients read
 * correctly.
 */
export const nullableString = () => z.string().max(100_000).nullable();

/**
 * A number or null in a response. A bare `z.number().nullable()` has the same problem as a
 * bare nullable string: clients would read it as a list of numbers. The bounds are only there
 * to give the schema a constraint.
 */
export const nullableNumber = () => z.number().min(-1e15).max(1e15).nullable();

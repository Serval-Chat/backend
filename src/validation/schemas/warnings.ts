import { z } from 'zod';
import {
    objectIdSchema,
    booleanQuerySchema,
} from '@/validation/schemas/common';

/**
 * Query parameters for getting warnings
 */
export const getWarningsQuerySchema = z.object({
    acknowledged: booleanQuerySchema,
});

/**
 * Warning ID parameter validation
 */
export const warningIdParamSchema = z.object({
    id: objectIdSchema,
});

export type GetWarningsQuery = z.infer<typeof getWarningsQuerySchema>;
export type WarningIdParam = z.infer<typeof warningIdParamSchema>;

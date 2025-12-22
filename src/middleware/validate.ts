import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { ZodError } from 'zod';

interface ValidationSchemas {
    body?: ZodSchema;
    params?: ZodSchema;
    query?: ZodSchema;
}

/**
 * Request validation middleware factory.
 *
 * Replaces the original request data with the parsed
 * (and potentially transformed by some Zod shits) data from Zod.
 */
export const validate = (schemas: ValidationSchemas) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (schemas.body) {
                req.body = await schemas.body.parseAsync(req.body);
            }

            if (schemas.params) {
                req.params = (await schemas.params.parseAsync(
                    req.params,
                )) as any;
            }

            if (schemas.query) {
                req.query = (await schemas.query.parseAsync(req.query)) as any;
            }

            next();
        } catch (error: any) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    error: `Validation error: ${error.issues.map((e) => e.message).join(', ')}`,
                });
            }
            return res.status(400).json({ error: 'Validation failed' });
        }
    };
};

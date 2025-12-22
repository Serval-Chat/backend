import type { Request, Response, NextFunction } from 'express';
import type { z, ZodTypeAny } from 'zod';
import { ZodError } from 'zod';

/**
 * Validation schemas for different parts of the request
 */
interface ValidationSchemas {
    body?: ZodTypeAny;
    query?: ZodTypeAny;
    params?: ZodTypeAny;
}

/**
 * Middleware factory for validating requests using Zod schemas
 *
 * @param schemas - Object containing optional Zod schemas for body, query, and params
 * @returns Express middleware function
 */
export const validate = (schemas: ValidationSchemas) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Validate request body
            if (schemas.body) {
                req.body = await schemas.body.parseAsync(req.body);
            }

            // Validate query parameters
            if (schemas.query) {
                req.query = (await schemas.query.parseAsync(req.query)) as any;
            }

            // Validate URL parameters
            if (schemas.params) {
                req.params = (await schemas.params.parseAsync(
                    req.params,
                )) as any;
            }

            next();
        } catch (error) {
            if (error instanceof ZodError) {
                // Format Zod validation errors into a user-friendly response
                const formattedErrors = error.issues.map((err) => ({
                    field: err.path.join('.'),
                    message: err.message,
                }));

                return res.status(400).json({
                    error: 'Validation failed',
                    details: formattedErrors,
                });
            }

            // Pass other errors to the error handler
            next(error);
        }
    };
};

/**
 * Middleware for validating partial updates (PATCH requests)
 * Uses Zod's partial() to make all fields optional
 *
 * @param schema - Zod schema to make partial
 * @returns Express middleware function
 *
 * @example
 * router.patch('/users/:id', validatePartial(updateUserSchema), handler);
 */
export const validatePartial = (schema: z.ZodObject<any>) => {
    return validate({ body: schema.partial() });
};

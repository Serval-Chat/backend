import { z } from 'zod';

/**
 * File parameter validation schema and fuckoffs to people who try to break the upload endpoint :3
 */
export const fileParamSchema = z.object({
    filename: z
        .string()
        .min(1, 'Filename is required')
        .refine(
            (filename) => {
                return (
                    !filename.includes('..') &&
                    !filename.includes('/') &&
                    !filename.includes('\\')
                );
            },
            { message: 'Invalid filename' },
        ),
});

export type FileParam = z.infer<typeof fileParamSchema>;

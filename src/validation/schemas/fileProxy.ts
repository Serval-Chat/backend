import { z } from 'zod';

// URL proxy validation schema
export const proxyUrlSchema = z.object({
    url: z.string().url('Valid URL is required'),
});

export type ProxyUrl = z.infer<typeof proxyUrlSchema>;

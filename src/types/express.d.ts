import type { JWTPayload } from '../utils/jwt';

declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
            route?: {
                path: string;
            };
        }
    }
}

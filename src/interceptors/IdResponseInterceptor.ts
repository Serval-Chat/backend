import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { toApiId } from '@/utils/mongooseId';

@Injectable()
export class IdResponseInterceptor implements NestInterceptor {
    public intercept(
        _context: ExecutionContext,
        next: CallHandler,
    ): Observable<unknown> {
        return next.handle().pipe(map((data) => toApiId(data)));
    }
}

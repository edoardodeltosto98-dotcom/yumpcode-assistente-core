import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { redact } from './redact.util.js';

/**
 * Logga ogni richiesta (metodo, path, tempo di risposta) passando
 * sempre il body attraverso redact() prima di scriverlo: nessun
 * token o contenuto di mail puo' finire nei log per errore, a
 * prescindere da cosa arriva nella richiesta.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body } = req;
    const start = Date.now();

    if (body && Object.keys(body).length > 0) {
      this.logger.debug(
        `${method} ${url} - body: ${JSON.stringify(redact(body))}`,
      );
    }

    return next.handle().pipe(
      tap(() => {
        this.logger.log(`${method} ${url} - ${Date.now() - start}ms`);
      }),
    );
  }
}

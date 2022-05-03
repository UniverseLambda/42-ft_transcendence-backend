import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';

@Injectable()
export class CacheMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    next();
  }
}

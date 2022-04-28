import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { read } from 'fs';
import { AppService } from './app.service';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger: Logger = new Logger(SecurityMiddleware.name);

  public constructor(public appService: AppService) {}

  async use(req: Request, res: Response, next: () => void) {
    if (!await this.appService.checkAuthedRequest(req)) {
      this.logger.warn(`unauthorized access to ${req.url} from ${req.ip}`);
      res.status(403).end();
      return;
    }
    next();
  }
}

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { read } from 'fs';
import { AppService } from './app.service';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  public constructor(public appService: AppService) {}

  async use(req: Request, res: Response, next: () => void) {
    if (!await this.appService.checkAuthedRequest(req)) {
      res.status(403).end();
      return;
    }
    next();
  }
}

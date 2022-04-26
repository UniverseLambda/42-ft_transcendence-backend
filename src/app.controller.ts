import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  rootMdr(): string {
    return "OwO What awe you doing hewe, step bwoswew :3";
  }
}

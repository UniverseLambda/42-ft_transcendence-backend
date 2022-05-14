import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  rootMdr(): string {
	  // wtf clem's
    return "OwO What awe you doing hewe, step bwoswew :3";
  }
}

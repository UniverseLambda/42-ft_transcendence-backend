import { Controller, Get, Param, Post, Query, Req, Request } from '@nestjs/common';
import { stringify } from 'querystring';
import { AppService } from '../app.service';

@Controller('login')
export class LoginController {
	constructor(private appService: AppService) {}

	@Get('oauth')
	async execLogin(@Query('uid') uid?: number, @Query('code') code?: string): Promise<any> {
		if (uid === undefined) {
			console.log("API error (no uid)");
			return "Woops mdr";
		}

		console.log("REGISTERD as " + uid + " with code " + code);

		if (code) {
			this.appService.receive_oauth_code(uid, code);
		} else {
			this.appService.receive_oauth_error(uid);
		}
	}
}

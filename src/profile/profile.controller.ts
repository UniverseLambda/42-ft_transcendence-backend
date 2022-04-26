import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AppService } from 'src/app.service';

@Controller('profile')
export class ProfileController {
	public constructor(public appService: AppService) {}

	@Post('set_name')
	async setName(@Req() req: Request, @Res({passthrough: true}) res: Response, @Body("newUsername") newUsername?: string) {
	let data = await this.appService.getSessionData(req);

		if (newUsername === undefined || newUsername === null) {
			return {
				success: false,
				reason: "No new username specified",
			}
		}

		if (newUsername.length == 0 || newUsername.length > this.appService.getMaxUsernameLength()) {
			return {
				success: false,
				reason: "Wrong username length",
			}
		}

		data.displayName = newUsername;
		// TODO: set new username in database

		res.cookie(this.appService.getSessionCookieName(), await this.appService.newToken(data));

		return {
			succes: true,
			reason: "Yay!"
		};
	}
}

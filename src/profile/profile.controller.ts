import { Body, Controller, Get, Param, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { AppService } from "src/app.service";
import * as fs from 'fs';

@Controller("profile")
export class ProfileController {
	public constructor(public appService: AppService) {}

	@Post("set_name")
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

	@Get("avatar/:id")
	async getAvatar(@Res() res: Response, @Param('id') idParam: string) {
		let id = Number.parseInt(idParam, 10);

		if (Number.isNaN(id)) {
			res.status(404).end();
		} else {
			let avatarPath = this.appService.getAvatarPath(id);

			if (!fs.existsSync(avatarPath)) {
				res.status(404).end();
			} else {
				res.status(200).sendFile(avatarPath);
			}
		}
	}
}

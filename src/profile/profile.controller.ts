import { Body, Controller, Get, Logger, Param, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { Request, Response } from "express";
import { AppService } from "src/app.service";
import * as fs from 'fs';
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";

@Controller("profile")
export class ProfileController {
	private readonly logger: Logger = new Logger(ProfileController.name);

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

	@Post("set_avatar")
	@UseInterceptors(FileInterceptor("avatar", {
		storage: diskStorage({
			filename: (req, file, cb) => {
				cb(null, `${Date.now()}-temp-avatar`);
			}
		})
	}))
	async setAvatar(@Req() req: Request, @Res() res: Response, @UploadedFile() file: Express.Multer.File) {
		console.log(file);
		let id = (await this.appService.getSessionData(req)).id;
		let previousPath = file.path;
		let newPath = this.appService.getAvatarPath(id);
		try {
			this.logger.debug(`Copying from ${previousPath} to ${newPath}...`);
			fs.copyFileSync(previousPath, newPath);

			new Promise((resolve, error) => {
				try {
					fs.rmSync(previousPath);
					resolve(true);
				} catch (reason) {
					error(reason);
				}
			});

			this.logger.log("OKAY :)");
			res.status(201).end();
		} catch (reason) {
			console.error(`Could not move new avatar: ${reason}`);
			res.status(500).end();
		}
	}
}

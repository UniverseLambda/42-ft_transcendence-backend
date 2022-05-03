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

	@Post("set_login")
	async setLogin(@Req() req: Request, @Body("newLogin") newLogin?: string) {
		let data = await this.appService.getSessionData(req);

		if (newLogin === undefined || newLogin === null) {
			return {
				success: false,
				reason: "No new login specified",
			}
		}

		if (newLogin.length == 0 || newLogin.length > this.appService.getMaxLoginLength()) {
			return {
				success: false,
				reason: "Wrong login length",
			}
		}

		let oldLogin = data.login;

		data.login = newLogin;
		// TODO: set new login in database

		this.logger.verbose(`Login changed from ${oldLogin} to ${data.login} for user ${data.getId()}`);
		return {
			succes: true,
			reason: "Yay!"
		};
	}

	@Get("avatar/:id")
	async getAvatar(@Res() res: Response, @Param('id') idParam: string) {
		let id = Number.parseInt(idParam, 10);

		if (Number.isNaN(id)) {
			this.logger.warn(`getAvatar: invalid id parameter ${idParam}`);
			res.status(404).end();
		} else {
			await this.appService.downloadAvatarIfMissing(id);

			let avatarPath = this.appService.getAvatarPath(id);

			if (!fs.existsSync(avatarPath)) {
				res.status(404).end();
			} else {
				res.sendFile(avatarPath, (error) => {
					if (error) {
						this.logger.error(`Could not send avatar: ${error}`)
					} else {
						this.logger.debug(`Successfully sent avatar for ${id}`);
					}
				});
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
		let id = (await this.appService.getSessionData(req)).getId();
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
			this.logger.error(`Could not move new avatar: ${reason}`);
			res.status(500).end();
		}
	}

	@Post("nuke_avatar")
	async resetAvatar(@Req() req: Request) {
		let data = await this.appService.getSessionData(req);
		let avatarPath = this.appService.getAvatarPath(data.getId());

		this.logger.debug(`Reseting avatar for user ${data.getId()} (${data.login})`);

		if (!fs.existsSync(avatarPath)) {
			return "Already default";
		}

		try {
			await new Promise((resolve, error) => {
				fs.unlink(avatarPath, (err) => {
					if (err) {
						error(err);
					} else {
						resolve("NOICE");
					}
				});
			});
		} catch (reason) {
			this.logger.error(`Could not reset avatar: ${reason}`);
		}


		return "OK";
	}

	@Post("get_friend_list")
	async getFriendList(@Req() req: Request) {
		let data = await this.appService.getSessionData(req);

		// login, level, rank, userStatus

		return [
			{
				id: 50,
				login: "YOLO",
				level: 50,
				rank: "ZEMASTER",
				userStatus: "Offline",
			},
			{
				id: 10,
				login: "clsaad",
				level: 50,
				rank: "N00b",
				userStatus: "Online",
			},
			{
				id: 2,
				login: "A",
				level: 50,
				rank: "Meh",
				userStatus: "InGame",
			},
		];
	}

	@Post(["match_history", "match_history/:id"])
	async getMatchHistory(@Req() req: Request, @Param("id") id?: string) {
		// versus, score, status
		let sess = await this.appService.getSessionData(req);

		return [
			{
				versus: "La-M",
				score: "50 - -56",
				status: "Lost (cheh)"
			},
			{
				versus: "Ort-ou",
				score: "42 - 42",
				status: "Tie"
			},
			{
				versus: "ChéChé",
				score: "50 - 2",
				status: "Win (chatteux vas)"
			},
		];
	}

	@Post("activate_2fa")
	async activate2FA(@Req() req: Request) {
		let sess = await this.appService.getSessionData(req);

		try {
			return {
				Code_Auth_recv: await this.appService.prepare2FA(sess)
			}
		} catch (reason) {
			this.logger.error(`activate_2fa: Could not generate initial 2FA: ${reason}`)
			return {
				Code_Auth_recv: null
			};
		}
	}

	@Post("validate_2fa")
	async validate2FA(@Req() req: Request, @Body("token") token?: string) {
		let sess = await this.appService.getSessionData(req);

		if (token === undefined || token === null) {
			this.logger.error(`validate2FA: no token in request for ${sess.getId()}`)
			return {
				error: "No token"
			}
		}

		this.logger.debug(`TOKEN: ${token}`);

		try {
			return {
				code: await this.appService.validate2FA(sess, token)
			}
		} catch (reason) {
			this.logger.error(`validate_2fa: could not validate initial 2FA: ${reason}`)
			return {
				code: false
			}
		}
	}
}

import { Body, Controller, Get, Logger, Param, Post, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { Request, Response } from "express";
import { AppService, ClientState, UserProfile, UserStatus } from "src/app.service";
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

		if (!await this.appService.isNameAvailable(newLogin)) {
			this.logger.warn(`setLogin: name "${newLogin}" already in use`);
			return {
				success: false,
				reason: "Name already in use",
			}
		}

		let oldLogin = data.profile.login;

		data.profile.login = newLogin;


		await this.appService.setNewLogin(data, newLogin);

		this.logger.verbose(`Login changed from ${oldLogin} to ${data.profile.login} for user ${data.getId()}`);
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

			this.appService.ensureFileOps(newPath);

			try {
				fs.renameSync(previousPath, newPath);
			} catch (reason) {
				this.logger.error(`setAvatar: renamemSync failed (${reason}). Using copyFileSync instead...`)
				fs.copyFileSync(previousPath, newPath);
			}

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

		this.logger.debug(`Reseting avatar for user ${data.getId()} (${data.profile.login})`);

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
		let sess = await this.appService.getSessionData(req);

		if (!sess) {
			try {
				this.logger.error(`getFriendList: sess === ${sess}. WTF IS WRONG WITH YOU GUYS`);
				let as = await this.appService.getTokenData(req.cookies[this.appService.getSessionCookieName()]);

				await this.appService.reviveUser(as.id);
				sess = await this.appService.getSessionData(req);

				if (!sess) {
					return [];
				}
			} catch {
				this.logger.error(`getFriendList: failed revival`);
				return [];
			}
		}

		return this.appService.getFriendList(sess);
	}

	@Post(["match_history", "match_history/:id"])
	async getMatchHistory(@Req() req: Request, @Param("id") id?: any) {
		let sess = await this.appService.getSessionData(req);

		if (!sess) {
			try {
				this.logger.error(`getMatchHistory: sess === ${sess}. WTF IS WRONG WITH YOU GUYS`);
				let as = await this.appService.getTokenData(req.cookies[this.appService.getSessionCookieName()]);

				await this.appService.reviveUser(as.id);
				sess = await this.appService.getSessionData(req);

				if (!sess) {
					this.logger.error(`getMatchHistory: failed revival (disc. 0)`);
					return [];
				}
			} catch {
				this.logger.error(`getMatchHistory: failed revival (disc. 1)`);
				return [];
			}
		}

		let idNum = Number.parseInt(id);

		if (id !== undefined && (!Number.isSafeInteger(idNum) || idNum <= 0)) {
			this.logger.error(`getMatchHistory: wrong id value: "${id}"`);
			return [];
		}

		return await this.appService.getHistoryList((id === undefined) ? sess.getId() : idNum);
	}

	@Post("get_user_info")
	async getUserInfo(@Req() req: Request, @Res() res: Response, @Body("targetId") idStr?: string) {
		let sess = await this.appService.getSessionData(req);
		let id: number;

		if (!idStr) {
			res.status(400).end();
			return;
		}

		id = Number.parseInt(idStr);

		if (Number.isNaN(id) || !Number.isSafeInteger(id) || id <= 0) {
			res.status(404).end();
			return;
		}

		let user: UserProfile = await this.appService.getUserInfo(id);
		let client: ClientState = await this.appService.getClientState(id);

		if (user === undefined) {
			return res.json({
				id: 0
			}).end();
		}

		let data: any = {
			id: id,
			login: user.login,
			displayName: user.displayName,
			imageUrl: this.appService.getAvatarUrl(id),
			userStatus: (client === undefined || client.socketCount === 0) ? UserStatus.Offline : client.userStatus,
			rank: user.rank,
			level: this.appService.calcLevel(user.xp),
			win: user.win,
			loose: user.loose,
			ratio: (user.loose === 0) ? (user.win) : (user.win / user.loose),
		}

		if (client && client.getId() === sess.getId()) {
			data.requires2FA = (client.profile.totpSecret !== undefined && client.profile.totpSecret !== null);
		}

		return res.json(data).end();
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

	@Post("deactivate_2fa")
	async deactivate2FA(@Req() req: Request) {
		let sess = await this.appService.getSessionData(req);

		this.appService.deactivate2FA(sess);
		return {};
	}

	@Post("add_friend")
	async addFriend(@Req() req: Request, @Body("targetId") targetId?: any): Promise<any> {
		let sess = await this.appService.getSessionData(req);

		if (typeof targetId !== "number" || !Number.isSafeInteger(targetId)) {
			this.logger.warn(`addFriend: invalid targetId value ${targetId}`);
			return {
				error: "TAMERE"
			};
		}

		return this.appService.addFriend(sess, targetId);
	}

	@Post("remove_friend")
	async removeFriend(@Req() req: Request, @Body("targetId") targetId?: any): Promise<any> {
		let sess = await this.appService.getSessionData(req);

		if (typeof targetId !== "number" || !Number.isSafeInteger(targetId)) {
			this.logger.warn(`removeFriend: invalid targetId value ${targetId}`);
			return {
				error: "TAMERE"
			};
		}

		return this.appService.removeFriend(sess, targetId);
	}
}

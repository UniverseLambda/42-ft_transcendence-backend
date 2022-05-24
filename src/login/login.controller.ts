import { Body, Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { AppService, AuthState, AuthStatus, ClientState } from '../app.service';
import { Request, Response } from 'express';
import * as util from "../util";

@Controller('login')
export class LoginController {
	private readonly logger: Logger = new Logger(LoginController.name);

	constructor(private appService: AppService) {}

	@Get('redir_42api')
	async redirApi42(@Req() request: Request, @Res() response: Response): Promise<any> {
		let cookie = request.cookies[this.appService.getSessionCookieName()];
		let sess: AuthState = undefined;

		if (cookie) {
			sess = await this.appService.getTokenData(cookie);
		}

		if (sess && sess.authStatus && sess.authStatus === AuthStatus.Accepted) {
			this.appService.reviveUser(sess.id);

			response.status(204).end();
			return;
		}

		response.cookie(this.appService.getSessionCookieName(), await this.appService.getInitialToken(), this.appService.getSessionCookieOptions());
		let redirUriPrefix = encodeURIComponent(`https://${util.getBackendHost()}${util.getBackendPrefix()}/login/oauth`);

		this.logger.debug(`Redir URL prefix: ${decodeURIComponent(redirUriPrefix)}`);

		response.redirect(`https://api.intra.42.fr/oauth/authorize?client_id=${this.appService.getAPIClientId()}&redirect_uri=${redirUriPrefix}&response_type=code`);
	}

	@Get('oauth')
	async handle42OAuth(@Req() request: Request, @Res({ passthrough: true }) response: Response, @Query('code') code?: string): Promise<any> {
		let resultingCookie;

		try {
			let cookie = request.cookies[this.appService.getSessionCookieName()];
			let sess: AuthState = undefined;

			if (cookie) {
				sess = await this.appService.getTokenData(cookie);
			}

			if (sess && sess.authStatus && sess.authStatus === AuthStatus.Accepted) {
				this.appService.reviveUser(sess.id);

				return "ZARMA";
			}
		} catch {}

		if (code) {
			resultingCookie = await this.appService.receiveOAuthCode(code);
		} else {
			resultingCookie = await this.appService.receiveOAuthError();
		}

		response.cookie(this.appService.getSessionCookieName(), resultingCookie, this.appService.getSessionCookieOptions());
	}

	@Post('is_auth')
	async isAuth(@Req() request: Request): Promise<any> {
		try {
			let token: string = request.cookies[this.appService.getSessionCookieName()];


			let authStatus = await this.appService.isAuth(token);
			let data: any = { authStatus: AuthStatus[authStatus] };

			if (authStatus === AuthStatus.Accepted) {
				let info: ClientState = await this.appService.getSessionDataToken(token);

				data.id = info.getId();
				data.login = info.profile.login;
				data.displayName = info.profile.displayName;
				data.imageUrl = this.appService.getAvatarUrl(info.getId());
				data.userStatus = info.userStatus;
				data.requires2FA = (info.profile.totpSecret !== undefined && info.profile.totpSecret !== null);
				data.level = this.appService.calcLevel(info.profile.xp);
				data.win = info.profile.win;
				data.loose = info.profile.loose;
				data.ratio = (info.profile.loose === 0) ? (info.profile.win) : (info.profile.win / info.profile.loose);
			}

			return data;
		} catch (reason) {
			this.logger.error(`isAuth: exception thrown (reason: ${reason}), returning AuthStatus 'Inexistant'`);
			return {
				authStatus: AuthStatus[AuthStatus.Inexistant]
			}
		}
	}

	@Post("2fa_login")
	async validate2FALogin(@Req() request: Request, @Res({passthrough: true}) response: Response, @Body("token") token?: string): Promise<any> {
		try {
			let cookie = request.cookies[this.appService.getSessionCookieName()];
			let auth: AuthState = await this.appService.getTokenData(cookie);

			if (auth.authStatus === AuthStatus.Accepted) {
				this.logger.warn(`validate2FALogin: user ${auth.id} already in AuthStatus Accepted. Returning Okay`);
				return {
					code: true
				};
			} else if (auth.authStatus !== AuthStatus.WaitingFor2FA) {
				this.logger.error(`validate2FALogin: trying to validate 2FA for user ${auth.id} while not being in WaitingFor2FA AuthStatus.`);
				return {
					code: false
				}
			}

			if (token === undefined || token === null) {
				this.logger.error(`validate2FALogin: no token in 2FA validation body for user ${auth.id}.`);
				return {
					code: false
				}
			}

			let result = await this.appService.login2FA(await this.appService.getSessionData(request), token);

			if (result) {
				auth.authStatus = AuthStatus.Accepted;
				response.cookie(this.appService.getSessionCookieName(), await this.appService.newToken(auth), this.appService.getSessionCookieOptions());
			}

			return {
				code: result
			}
		} catch (reason) {
			this.logger.error(`validate2FALogin: exception thrown (reason: ${reason})`);
			return {
				code: false
			}
		}
	}
}

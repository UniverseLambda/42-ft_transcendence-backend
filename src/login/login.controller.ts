import { Body, Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { AppService, AuthState, AuthStatus, ClientState } from '../app.service';
import { Request, Response } from 'express';

@Controller('login')
export class LoginController {
	private readonly logger: Logger = new Logger(LoginController.name);

	constructor(private appService: AppService) {}

	@Get('redir_42api')
	async redirApi42(@Req() request: Request, @Res() response: Response): Promise<any> {
		let cookie = request.cookies[this.appService.getSessionCookieName()];
		let sess = undefined;

		if (cookie) {
			sess = await this.appService.getTokenData(cookie);
		}

		// TODO: Session duplication
		if (sess && sess.authStatus && sess.authStatus === AuthStatus.Accepted) {
			response.status(204).end();
			return;
		}

		response.cookie(this.appService.getSessionCookieName(), await this.appService.getInitialToken(), this.appService.getSessionCookieOptions());
		response.redirect(`https://api.intra.42.fr/oauth/authorize?client_id=${this.appService.getAPIClientId()}&redirect_uri=https%3A%2F%2F${this.appService.getBackendHost()}%3A3000%2Flogin%2Foauth&response_type=code`);
	}

	@Get('oauth')
	async handle42OAuth(@Res({ passthrough: true }) response: Response, @Query('code') code?: string): Promise<any> {
		let resultingCookie;

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

				data.login = info.login;
				data.displayName = info.displayName;
				data.imageUrl = `https://${this.appService.getBackendHost()}:3000/profile/avatar/${info.getId()}`;
				data.userStatus = info.userStatus;
				data.requires2FA = info.totpSecret !== undefined;
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
				response.cookie(this.appService.getSessionCookieName(), this.appService.newToken(auth), this.appService.getSessionCookieOptions());
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

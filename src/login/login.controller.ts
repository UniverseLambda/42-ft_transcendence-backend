import { Controller, Get, Logger, Post, Query, Req, Res } from '@nestjs/common';
import { AppService, AuthStatus } from '../app.service';
import { Request, Response } from 'express';

@Controller('login')
export class LoginController {
	private readonly logger: Logger = new Logger(LoginController.name);

	constructor(private appService: AppService) {}

	@Get('redir_42api')
	async redirApi42(@Req() request: Request, @Res() response: Response): Promise<any> {
		let sess = await this.appService.getSessionData(request);

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
				let info = await this.appService.retrieveUserData(token);

				data.login = info.login;
				data.displayName = info.displayName;
				data.imageUrl = `https://${this.appService.getBackendHost()}:3000/profile/avatar/${info.id}`;
				data.userStatus = info.userStatus;
			}

			return data;
		} catch (reason) {
			this.logger.error(`isAuth: exception thrown (reason: ${reason}), returning AuthStatus 'Inexistant'`);
			return {
				authStatus: AuthStatus[AuthStatus.Inexistant]
			}
		}
	}
}

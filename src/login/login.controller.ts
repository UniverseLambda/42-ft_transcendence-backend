import { ConsoleLogger, Controller, Get, Post, Query, Redirect, Req, Res } from '@nestjs/common';
import { AppService, AuthStatus } from '../app.service';
import { Request, Response } from 'express';

@Controller('login')
export class LoginController {
	constructor(private appService: AppService) {}

	@Get('redir_42api')
	async redirApi42(@Req() request: Request, @Res() response: Response): Promise<any> {
		let sess = await this.appService.getSessionData(request);

		// TODO: Session duplication
		if (sess && sess.status && sess.status === AuthStatus.Accepted) {
			response.status(204).end();
			return;
		}

		response.cookie(this.appService.getSessionCookieName(), await this.appService.getInitialToken(), this.appService.getSessionCookieOptions());
		response.redirect(`https://api.intra.42.fr/oauth/authorize?client_id=3cf0f70b74141822d0e52fc4858b288427ab9e62f4892d7390827f265748bdd7&redirect_uri=https%3A%2F%2F${this.appService.getBackendHost()}%3A3000%2Flogin%2Foauth&response_type=code`);
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

			let status = await this.appService.isAuth(token);
			let data: any = { status: AuthStatus[status] };

			if (status === AuthStatus.Accepted) {
				let info = await this.appService.retrieveUserData(token);

				data.login = info.login;
				data.displayName = info.displayName;
				data.imageUrl = `https://${this.appService.getBackendHost()}:3000/profile/avatar/${info.id}`;
			}


			return data;
		} catch (reason) {
			console.error(`isAuth: exception thrown (reason: ${reason}), returning AuthStatus 'Inexistant'`);
			return {
				status: AuthStatus[AuthStatus.Inexistant]
			}
		}
	}
}

import { Controller, Get, Post, Query, Redirect, Req, Res } from '@nestjs/common';
import { AppService, AuthStatus } from '../app.service';
import { Request, Response } from 'express';

@Controller('login')
export class LoginController {
	constructor(private appService: AppService) {}

	@Get('redir_42api')
	@Redirect()
	async redirApi42(@Res({ passthrough: true }) response: Response): Promise<any> {
		let uid = 666;

		response.cookie('uid', uid, {sameSite: "none", secure: true});

		return {
			url: `https://api.intra.42.fr/oauth/authorize?client_id=3cf0f70b74141822d0e52fc4858b288427ab9e62f4892d7390827f265748bdd7&redirect_uri=https%3A%2F%2F${this.appService.getBackendHost()}%3A3000%2Flogin%2Foauth&response_type=code`
		}
	}

	@Get('oauth')
	async handle42OAuth(@Req() request: Request, @Query('code') code?: string): Promise<any> {
		let uid;

		if (!(uid = this.appService.checkAuthedRequest(request))) {
			console.error("handle42OAuth: NO COOKIE");
			return;
		}

		if (code) {
			this.appService.receiveOAuthCode(uid, code);
		} else {
			this.appService.receiveOAuthError(uid);
		}
	}

	@Post('is_auth')
	async isAuth(@Req() request: Request): Promise<any> {
		let uid = request.cookies['uid'];
		console.log("UID: " + uid);

		if (!request.cookies['uid']) {
			console.log("isAuth: NO COOKIE");
			return {status: AuthStatus[AuthStatus.Inexistant]};
		}

		let status = this.appService.isAuth(uid);
		let data: any = { status: AuthStatus[status] };

		if (status === AuthStatus.Accepted) {
			let info = await this.appService.retrieveUserData(uid);

			data.login = info.login;
			data.displayName = info.displayName;
			data.imageUrl = info.imageUrl;
		}


		return data;
	}

	// @Post('get_data')
	// async getData(@Req() request: Request): Promise<any> {
	// 	let uid;

	// 	if (!(uid = this.appService.checkAuthedRequest(request))) {
	// 		console.error("getData: NO COOKIE");
	// 		return "NOPE MDR";
	// 	}

	// 	let info = await this.appService.retrieveUserData(uid);

	// 	return {
	// 		login: info.login,
	// 		displayName: info.displayName,
	// 		imageUrl: info.imageUrl,
	// 	}
	// }
}

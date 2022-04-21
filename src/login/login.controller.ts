import { Controller, Get, Post, Query, Redirect, Req, Res } from '@nestjs/common';
import { AppService, AuthStatus } from '../app.service';
import { Request, Response } from 'express';

@Controller('login')
export class LoginController {
	constructor(private appService: AppService) {}

	// @Post('init')
	// async initSession(@Res({ passthrough: true }) response: Response): Promise<any> {
	// 	let uid = 666;

	// 	response.cookie('uid', uid, {sameSite: "none", secure: true});

	// 	return true;
	// }

	@Get('redir_42api')
	@Redirect()
	async redirApi42(@Res({ passthrough: true }) response: Response): Promise<any> {
		let uid = 666;

		response.cookie('uid', uid, {sameSite: "none", secure: true});

		return {
			url: `https://api.intra.42.fr/oauth/authorize?client_id=3cf0f70b74141822d0e52fc4858b288427ab9e62f4892d7390827f265748bdd7&redirect_uri=https%3A%2F%2F10.3.8.3%3A3000%2Flogin%2Foauth&response_type=code`
		}
	}

	@Get('oauth')
	async handle42OAuth(@Req() request: Request, @Query('code') code?: string): Promise<any> {
		let uid = request.cookies['uid'];

		if (code) {
			this.appService.receive_oauth_code(uid, code);
		} else {
			this.appService.receive_oauth_error(uid);
		}
	}

	@Post('is_auth')
	isAuth(@Req() request: Request): Object {
		let uid = request.cookies['uid'];
		console.log("UID: " + uid);

		if (!request.cookies['uid']) {
			console.log("NO COOKIE");
			// return AuthStatus[AuthStatus.Inexistant];
			return AuthStatus[AuthStatus.Inexistant];
		}

		let status = AuthStatus[this.appService.isAuth(uid)];

		console.log("Status: " + status);

		return status;
	}
}

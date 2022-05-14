import { Controller, Get, Post} from '@nestjs/common';

@Controller('game')
export class GameController {

	@Get('ball')
	async returnBallPosition() : Promise<any> {}

	@Post('player')
	async modifyPlayerPosition() : Promise<any> {}

}

import { settings } from './game.settings'
import { shape } from './game.shape'
import { tools } from './game.tools'
import { datas } from './game.datas'
import { controller } from './game.controller'
import { Socket } from 'socket.io';
import { Vector3 } from 'three'
import { Logger } from '@nestjs/common'

export class logic {
	private static _angle:number = 0;
	private static _ballDirection:Vector3 = new Vector3(tools.getRandom(0, 2),0,0);

	static ballDirection(startGame:boolean, ball:Vector3, delta:number): Vector3 {
		if (!startGame) {
			settings.ballSpeed = 100;
			logic._angle = 0;
			// logic._ballDirection = new Vector3(tools.getRandom(0, 2),0,0);
			logic._ballDirection = new Vector3(1,0,0);
			ball.z = 0;
			ball.x = 0;
		}
		else {
			// ball.translateOnAxis(logic._ballDirection, settings.ballSpeed * delta);
			ball.x = logic._ballDirection.x * settings.ballSpeed * (delta / 1000);
			ball.z = logic._ballDirection.z * settings.ballSpeed * (delta / 1000);
		}
		return logic._ballDirection;
	}

	 static checkGoals(startGame:boolean, ball:Vector3, ground:number) {
		// goal left
		if (ball.x < -(ground / 2)) {
			datas.score2++;
			// document.querySelector("#score2")!.innerHTML = datas.score2.toString();
			startGame = false;
		}
		// goal right
		else if (ball.x > (ground / 2)) {
			datas.score1++;
			// document.querySelector("#score1")!.innerHTML = datas.score1.toString();
			startGame = false;
		}
	}
	 static checkBounce(ball:Vector3, ground:number) {
		// if (ball.z > ground.mesh.geometry.boundingBox!.max.z
		// || ball.z < ground.mesh.geometry.boundingBox!.min.z) {
		if (ball.z > (ground / 2)
		|| ball.z < -(ground / 2)) {
			logic._angle *= -1;
			logic._ballDirection.z = 1/180 * logic._angle;
			// console.log('direction = ', logic._ballDirection.z);
		}
	}

	static checkHits(ball:Vector3, player1Z:number, player2Z:number, groundWidth:number) {
		let left = true;
		if (ball.x > 0)
			left = false;
		if (left) {
			// player1
			Logger.log('-(groundWidth / 2) + 10', -(groundWidth / 2) + 10)
			if (ball.z > player1Z - settings.playerSize
			&& ball.z < player1Z + settings.playerSize
			&& ball.x < -(groundWidth / 2) + 10 ) {
				logic._angle = logic.hitBall(ball, player1Z, 120);
				logic._ballDirection = new Vector3(1, 0, 1/180 * logic._angle);
				// console.log('logic._angle = ', logic._angle);
				settings.ballSpeed += 10;
			}
		}
		else {
			// player2
			if (ball.z > player2Z - settings.playerSize
			&& ball.z < player2Z + settings.playerSize
			&& ball.x > (groundWidth / 2) - 10) {
				logic._angle = logic.hitBall(ball, player2Z, 120);
				logic._ballDirection = new Vector3(-1, 0, 1/180 * logic._angle);
				// console.log('logic._angle = ', logic._angle);
				settings.ballSpeed += 10;
			}
		}
	}
	private static hitBall(ball:Vector3, player:number, maxAngle:number) {
		var ratio = maxAngle/settings.playerSize;
		return ratio * (ball.z - player);
	}

	static isEndOfGame(score1:number, score2:number):boolean {
		if (score1 >= 13 || score2 >= 13)
			if (score1 >= score2 + 2 || score2 >= score1 + 2)
				return true;
		return false;
	}
}

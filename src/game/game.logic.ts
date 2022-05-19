import * as THREE from 'three'
import { settings } from './game.settings'
import { shape } from './game.shape'
import { tools } from './game.tools'
import { datas } from './game.datas'
import { controller } from './game.controller'
import { Socket } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';

export class logic {
	private static _startGame:boolean = false;
	private static _angle:number = 0;
	private static _ballDirection:THREE.Vector3 = new THREE.Vector3(tools.getRandom(0, 2),0,0);

	public static get startGame() : boolean { return logic._startGame; }
	public static set startGame(value : boolean) { logic._startGame = value; }

	static ballDirection(ball:shape, delta:number) {
		if (!logic._startGame) {
			settings.ballSpeed = 200;
			logic._angle = 0;
			logic._ballDirection = new THREE.Vector3(tools.getRandom(0, 2),0,0);
			ball.mesh.position.x = 0; ball.mesh.position.y = 1; ball.mesh.position.z = 0;
		}
		else {
			const targetPosition = ball.mesh.position.clone();
			ball.mesh.translateOnAxis(logic._ballDirection, settings.ballSpeed * delta);
			ball.mesh.position.lerp(targetPosition, 0.5);
		}
	}

	static checkHits(ball:shape, player1:shape, player2:shape) {
		// player1
		if (ball.mesh.position.z > player1.mesh.position.z - settings.playerSize
		&& ball.mesh.position.z < player1.mesh.position.z + settings.playerSize
		&& ball.mesh.position.x < player1.mesh.position.x) {
			logic._angle = logic.hitBall(ball, player1, 120);
			logic._ballDirection = new THREE.Vector3(1, 0, 1/180 * logic._angle);
			// console.log('logic._angle = ', logic._angle);
			settings.ballSpeed += 10;
		}
		// player2
		else if (ball.mesh.position.z > player2.mesh.position.z - settings.playerSize
			&& ball.mesh.position.z < player2.mesh.position.z + settings.playerSize
			&& ball.mesh.position.x > player2.mesh.position.x) {
			logic._angle = this.hitBall(ball, player2, 120);
			logic._ballDirection = new THREE.Vector3(-1, 0, 1/180 * logic._angle);
			// console.log('logic._angle = ', logic._angle);
			settings.ballSpeed += 10;
		}
	}
	static checkGoals(ball:shape, ground:shape) {
		// goal left
		if (ball.mesh.position.x < ground.mesh.geometry.boundingBox!.min.x) {
			datas.score2++;
			document.querySelector("#score2")!.innerHTML = datas.score2.toString();
			this._startGame = false;
		}
		// goal right
		else if (ball.mesh.position.x > ground.mesh.geometry.boundingBox!.max.x) {
			datas.score1++;
			document.querySelector("#score1")!.innerHTML = datas.score1.toString();
			this._startGame = false;
		}
	}
	static checkBounce(ball:shape, ground:shape) {
		if (ball.mesh.position.z > ground.mesh.geometry.boundingBox!.max.z) {
			logic._angle *= -1;
			logic._ballDirection.z = 1/180 * logic._angle;
			// console.log('logic._angle = ', logic._angle);
		}
		else if (ball.mesh.position.z < ground.mesh.geometry.boundingBox!.min.z) {
			logic._angle *= -1;
			logic._ballDirection.z = 1/180 * logic._angle;
			// console.log('logic._angle = ', logic._angle);
		}
	}

	private static hitBall(ball:shape, player:shape, maxAngle:number) {
		var ratio = maxAngle/settings.playerSize;
		return ratio * (ball.mesh.position.z - player.mesh.position.z);
	}


	static checkKeys(socket:Socket<DefaultEventsMap, DefaultEventsMap>) {
		document.onkeydown = (e) => {
			// console.log('event = ', e.key);
			if (e.key == controller.down.key)
				controller.down.isOn = true;
			else if (e.key == controller.up.key)
				controller.up.isOn = true;
			else if (e.key == controller.start.key) {
				logic._startGame = true;
				socket.emit('throwBall');
			}
		};
		document.onkeyup = (e)=> {
			if (e.key == controller.up.key)
				controller.up.isOn = false;
			if (e.key == controller.down.key)
				controller.down.isOn = false;
		};
	}
	static onKeyAction(speedMove:number, player:shape, ground:shape, delta:number, socket:Socket<DefaultEventsMap, DefaultEventsMap>) {
		if (controller.up.isOn || controller.down.isOn) {
			if (player.mesh.position.z - settings.playerSize > ground.mesh.position.z
			- (ground.depth/2) + 2 && controller.up.isOn) {
				player.mesh.position.z -= (speedMove * delta);
			}
			else if (player.mesh.position.z + settings.playerSize < ground.mesh.position.z
			+ (ground.depth/2) - 2 && controller.down.isOn) {
				player.mesh.position.z += (speedMove * delta);
			}
			socket.emit('playerPosition', player.mesh.position);
		};
	}

	static isEndOfGame(score1:number, score2:number):boolean {
		if (score1 >= 13 || score2 >= 13)
			if (score1 >= score2 + 2 || score2 >= score1 + 2)
				return true;
		return false;
	}
}

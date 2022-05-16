import * as THREE from 'three'
import { threadId } from 'worker_threads';
import { datas } from './game.datas';
import { logic } from './game.logic'
import { shape } from 'src/game/game.shape'
import { Socket } from 'socket.io'

export class game {
	private _clock:THREE.Clock;
	private _delta:number;
	private _socketP1 : Socket;
	private _socketP2 : Socket;

	private _endOfGame:boolean;

	private _ground:shape;
	private _ball:shape;
	private _player1:shape;
	private _player2:shape;


	public get ballPosition() : THREE.Vector3 {
		return this._ball.mesh.position;
	}
	// public set ballPosition(position : THREE.Vector3) {
	// 	this._ball.mesh.position.x = position.x;
	// 	this._ball.mesh.position.y = position.y;
	// 	this._ball.mesh.position.z = position.z;
	// }
	public get player1Position() : THREE.Vector3 {
		return this._player1.mesh.position;
	}
	// public set player1Position(position : THREE.Vector3) {
	// 	this._player1.mesh.position.x = position.x;
	// 	this._player1.mesh.position.y = position.y;
	// 	this._player1.mesh.position.z = position.z;
	// }
	public get player2Position() : THREE.Vector3 {
		return this._player2.mesh.position;
	}
	// public set player2Position(position : THREE.Vector3) {
	// 	this._player2.mesh.position.x = position.x;
	// 	this._player2.mesh.position.y = position.y;
	// 	this._player2.mesh.position.z = position.z;
	// }

	public get endOfGame() : boolean {
		return this._endOfGame;
	}


	constructor(player1 : Socket, player2 : Socket) {

		this._socketP1 = player1;
		this._socketP2 = player2;

		this._clock = new THREE.Clock();
		this._delta = this._clock.getDelta();

		this._endOfGame = false;

		this._ground = new shape("ground", 300, 0, 150, 0xffffff);

		this._ball = new shape("ball", 3, 100, 100, 0x5C2D91);
		this._ball.mesh.position.y = 1;

		this._player1 = new shape("player1", 5, 10, 30, 0x00ff00);
		this._player1.mesh.position.x = this._ground.mesh.geometry.boundingBox!.min.x + 10;
		this._player2 = new shape("player2", 5, 10, 30, 0x00ff00);
		this._player2.mesh.position.x = this._ground.mesh.geometry.boundingBox!.max.x - 10;
	}

	update() : Promise<any> {
		// window.requestAnimationFrame(() => { this.update() });
		this._delta = this._clock.getDelta();
		logic.ballDirection(this._ball, this._delta);
		logic.checkHits(this._ball, this._player1, this._player2);
		logic.checkGoals(this._ball, this._ground);
		logic.checkBounce(this._ball, this._ground);
		if (logic.isEndOfGame(datas.score1, datas.score2)) {
			this._endOfGame = true;
			return ;
		}
		this._socketP1.emit('ballPosition', this._ball.mesh.position);
		this._socketP2.emit('ballPosition', this._ball.mesh.position);
	}
}

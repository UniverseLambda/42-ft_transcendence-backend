import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io'
import { AppService, ClientState } from 'src/app.service';
import { parse } from "cookie";
import { game } from "src/game/game.server"
import { shape } from "src/game/game.shape"
import { logic } from "src/game/game.logic"

// import { EngineService } from "src/game/engine.service"
import { Job, JobId } from "bull"

// import { Vector3 } from 'three';

import * as THREE from 'three';
import { cli } from 'webpack';

export class Position { constructor(public posx : number, public posy : number, public posz : number) {}; }
export class Players { constructor(public p1 : string, public p2 : string) {} }
export class Scores { constructor(public p1 : number, public p2 : number) {} }
export class Emit { constructor(public givenBall : Position, public id : number, ) { } }

export class Client {
	private inGame : boolean = true;
	constructor(private socket : Socket,
		private state : ClientState) {}

	sendMessage(id : string, payload : any) {
		this.socket.emit(id, payload);
	}

	public get clientState() : number { return this.state.getId(); }

	public get isInGame() : boolean { return this.inGame; }
	public set isInGame(status : boolean) { this.inGame = status; }
}

export class GameSession {
	constructor(jobId : JobId, difficulty : number, player1 : Client, player2 : Client) {}
}

@Injectable()
export class GameService {
	private readonly logger : Logger = new Logger(GameService.name);

	private clientList : Map<string, Client>;
	private pendingList : Array<Client>;
	private gameList : Map<string, GameSession>;

	public newsocket1 : Socket;
	public newsocket2 : Socket;
	public clientNb : number = 0;
	public serverGame : game;
	public jobId : JobId;

	public ballP1Received:boolean;
	public ballP2Received:boolean;
	public ballP1Pos:THREE.Vector3;
	public ballP2Pos:THREE.Vector3;

	// constructor(private engineService : EngineService) {}
	constructor() {
		this.ballP1Received = false;
		this.ballP2Received = false;
		this.ballP1Pos = new THREE.Vector3();
		this.ballP2Pos = new THREE.Vector3();
	}

	async registerClient(appService : AppService, socket : Socket) {
		++this.clientNb;
		Logger.log(`clientNb = ${this.clientNb}`);
		// try {
		// 	var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
		// 	var state = await appService.getSessionDataToken(cookie);
		// 	var playerInfo = new PlayersInfo(new Position(0,0,0), socket, state);
		// }
		// catch {
		// 	this.logger.error(`registerClient: cannot connect client ${socket.id} !`)
		// 	this.sendMessage(socket, 'connectionFailure', '');
		// 	return false;
		// 	// Throw error !
		// }
		// if (this.clientsList.has(socket.id)) {
		// 	this.logger.error(`registerClient: client ${playerInfo.getId()} already logged.`)
		// 	this.sendMessage(socket, 'connectionFailure', '');
		// 	return false;
		// }
		// this.clientsList.set(socket.id, playerInfo);
		// this.clientsSIDList.set(playerInfo.getId(), socket.id);
		if (this.clientNb === 1) {
			this.newsocket1 = socket;
			// this.newsocket1.emit('player1');
		}
		else if (this.clientNb === 2) {
			this.newsocket2 = socket;
			// this.newsocket2.emit('player2');
			this.startGame();
			this.clientNb = 0;
		}
		socket.emit('connectionSucced');
		return true;
	}

	unregisterClient(appService : AppService, client : Socket) {
		return true;
	}

	//////////////////////////////////////////////////
	///////////////// GAME PHASE
	// Game phase : searching, starting and end game session
	searchGame() {
	}

	cancelSearchGame() {
	}

	startGame() {
		// this.serverGame = new game(this.newsocket1, this.newsocket2);
		// TO DO : send opponent position
		this.newsocket1.emit('launch');
		this.newsocket2.emit('launch');
		// this.newsocket1.emit('player1');
		// this.newsocket2.emit('player2');

		// this.newsocket1.on('ballClient', (data1:THREE.Vector3) => {
		// 	this.newsocket2.on('ballClient',(data2:THREE.Vector3) => {
		// 		console.log('ballClient event received by the 2 clients');

		// 		let ballPosition:THREE.Vector3 = data1.lerp(data2, 0.5);
		// 		this.newsocket1.emit('ballServer', ballPosition);
		// 	});
		// });
		// this.newsocket1.on('playerPosition', (data:THREE.Vector3) => {
		// 	console.log('playerPosition event received by the client 1');

		// 	this.newsocket2.emit('opponentPosition', data);
		// });
		// this.newsocket2.on('playerPosition', (data:THREE.Vector3) => {
		// 	console.log('playerPosition event received by the client 2');

		// 	this.newsocket1.emit('opponentPosition', data);
		// });
		// this.newsocket2.emit('launch');
		// this.jobId = this.engineService.startEngine();
	}

	async launchUpdate() {
		await this.serverGame.update();
		// if (this.serverGame.endOfGame === true)
		// 	this.engineService.stopEngine(this.jobId);
	}

	throwBall(client : Socket) {
		if (client !== this.newsocket1)
			return ;
		Logger.log('ball thrown');
		this.newsocket1.emit('startGame');
		this.newsocket2.emit('startGame');
	}

	//////////////////////////////////////////////////
	///////////////// UPDATE INFO
	// Info get from clients

	// Checkand update new player state
	updatePlayer(client : Socket, position : THREE.Vector3) {
		// client.emit('opponentPosition', position);
		position.x *= -1;
		if (client.id === this.newsocket1.id) {
			// Logger.log('player 1 position =', position);
			this.newsocket2.emit('opponentPosition', position);
		}
		else if (client.id === this.newsocket2.id) {
			this.newsocket1.emit('opponentPosition', position);
			// Logger.log('player 2 position =', position);
		}
		// console.log('playerPosition event received by the client');
		// Logger.log('position =', position);
		// Check player pos
		// Launch potention event
	}

	updateBallPosition() {
		// let x = THREE.MathUtils.lerp(this.ballP1Pos.x, this.ballP2Pos.x, 0.5);
		// let y = THREE.MathUtils.lerp(this.ballP1Pos.y, this.ballP2Pos.y, 0.5);
		// let z = THREE.MathUtils.lerp(this.ballP1Pos.z, this.ballP2Pos.z, 0.5);
		// let ballPos = new THREE.Vector3(x, y, z);
		this.ballP1Pos.x *= -1;
		// this.ballP1Pos.z *= -1;
		this.newsocket1.emit('ballServer', this.ballP1Pos);
		this.newsocket2.emit('ballServer', this.ballP1Pos);
		// Logger.log('emited ball position =', this.ballP1Pos);
	}

	getPaddlePos() {
		// reception and transformation of the info
	}

	getEventPos() {
	}
}

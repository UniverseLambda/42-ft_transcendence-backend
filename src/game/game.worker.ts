import { Logger } from "@nestjs/common";
import { parentPort, workerData } from "worker_threads";

const LOOP_WAIT_MS: number = 10 /* ms */;
const SYNC_DELAY: number = 500;
const MAP_WIDTH: number = 300;
const MAP_HEIGHT: number = 150;
const PLAYER_WIDTH: number = 5;
const PLAYER_HEIGHT: number = 30;
const BALL_RADIUS: number = 1;
const BALL_SPEED: number = 10;

const BALL_INIT_VELX: number = 0.85;
const BALL_INIT_VELY: number = 0.15;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const logger = new Logger("GameWorker");

parentPort.on("message", dispatchMessage);

class Data {
	public playerPos: number[] = [0, 0];
	public ballPosX: number = 0;
	public ballPosY: number = 0;
	public ballVelX: number = 0;
	public ballVelY: number = 0;

	public roundPromise: Promise<void> = null;
}

var games: Map<number, Data> = new Map();

function startGame(id: number): void {
	games.set(id, new Data());
}

function throwBall(id: number): void {
	logger.debug(`THROWBALL: ${id}`);

	let game = games.get(id);

	game.ballVelX = BALL_INIT_VELX;
	game.ballVelY = BALL_INIT_VELY;

	game.roundPromise = roundUpdate(id, game);
}

function endGame(id: number): void {
	games.delete(id);
}

function setPlayerPos(id: number, player: number, pos: number): void {
	let game = games.get(id);

	game.playerPos[player] = pos;

	emitMessage("onPlayerSync", {id: id, player: player, pos: pos});
}

function dispatchMessage(message: any) {
	switch (message.event) {
		case "startGame": startGame(message.data.id); break;
		case "throwBall": throwBall(message.data.id); break;
		case "setPlayerPos": setPlayerPos(message.data.id, message.data.player, message.data.pos); break;
		case "endGame": endGame(message.data.id); break;
	}
}

async function roundUpdate(id: number, game: Data) {
	let lastLoop = Date.now();
	let lastUpdate = 0;

	emitMessage("ballThrown", {id: id});

	while (true) {
		await sleep(LOOP_WAIT_MS /* ms */);


		let delta = Date.now() - lastLoop;

		// DATA

		game.ballPosX += game.ballVelX * BALL_SPEED * (delta / 1000.0);
		game.ballPosY += game.ballVelY * BALL_SPEED * (delta / 1000.0);

		let highY = game.ballPosY + (BALL_RADIUS / 2);
		let lowY = game.ballPosY - (BALL_RADIUS / 2);

		if (highY >= (MAP_HEIGHT / 2)) {
			game.ballVelY *= -1;
			game.ballPosY = +((MAP_HEIGHT / 2) - (BALL_RADIUS));
		} else if (lowY <= -(MAP_HEIGHT / 2)) {
			game.ballVelY *= -1;
			game.ballPosY = -((MAP_HEIGHT / 2) - (BALL_RADIUS));
		}

		if (Date.now() - lastUpdate >= SYNC_DELAY) {
			emitMessage("ballSync", {
				id: id,
				pos: [game.ballPosX, game.ballPosY],
				vel: [game.ballVelX, game.ballVelY]});

			lastUpdate = Date.now();
		}

		lastLoop = Date.now();
	}
}

function emitMessage(event: string, data: any) {
	parentPort.postMessage({event: event, data: data});
}

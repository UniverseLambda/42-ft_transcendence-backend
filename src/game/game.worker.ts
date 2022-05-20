import { Logger } from "@nestjs/common";
import { parentPort, workerData } from "worker_threads";

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
	// logger.debug(`THROWBALL: ${id}`);

	let game = games.get(id);

	game.ballVelX = 0.1;
	game.ballVelY = 0.9;

	game.roundPromise = roundUpdate(id);

	emitMessage("ballThrown", {id: id});
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

async function roundUpdate(gameId: number) {
	while (true) {
		await sleep(10);
	}
}

function emitMessage(event: string, data: any) {
	parentPort.postMessage({event: event, data: data});
}

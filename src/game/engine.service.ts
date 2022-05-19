import { Injectable } from '@nestjs/common';
import { Queue, Job, JobId  } from 'bull';
import { InjectQueue, Processor, Process } from '@nestjs/bull';
import { GameService, GameSession } from 'src/game/game.service'

import * as THREE from 'three';

import { Socket } from 'socket.io'

@Injectable()
export class EngineService {
	constructor(@InjectQueue('gameEngine') private enginQueue : Queue, private gameService : GameService) { }

	private jobList : Map<JobId, Job>;
	// Add the update() loop to the queue.
	// Precise job parameters -> repeat + communicate data
	// TO DO : add object in arg to pass data
	async sendBall(socket1 : Socket, socket2 : Socket, game : GameSession ) : Promise<JobId> {
		var newJob : Job<any> = await this.enginQueue.add( 'engineLoop',
		{ players : {socket1, socket2}, ballPosition : game.getBallPosition},
		{ repeat : {every : 15} }
		);
		this.jobList.set(newJob.id, newJob);
		return newJob.id;
	}

	async stopEngine(jobId : JobId) {
		await this.jobList.get(jobId).remove();
	}

	async updateBall(client : Socket, payload : THREE.Vector3) {
		var newJob : Job<any> = await this.enginQueue.add( 'updateBall',
		{ client, payload }
		);
		this.jobList.set(newJob.id, newJob);
	}
}

// TODO : Shall be moved to it's own file with :
// import { Processor, Process } from '@nestjs/bull';
// import { Queue } from 'bull';
// import { GameService } from 'src/game/game.service'
// import { Socket } from 'socket.io'
@Processor('gameEngine')
export class EngineConsumer {
	constructor(private gameService : GameService) {}

	@Process('engineLoop')
	async engineLoop(job : Job<any>) {
		// await this.gameService.sendBallPosition(job);
	}

	// need implementation
	@Process('updateBall')
	async updateBall(job : Job<any>) {
		await this.gameService.updateBallPosition(job.data.client, job.data.payload);
	}
}

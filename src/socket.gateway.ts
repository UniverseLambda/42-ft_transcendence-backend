import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Socket } from 'dgram';
import { AppService } from './app.service';

@WebSocketGateway({ cors: { origin: ['http://localhost:4200'] } })
export class SocketGateway {
  constructor(private appService: AppService) {}

  // @SubscribeMessage('login')
  // handleLogin(client: Socket, payload: any) {
  //   let uid = this.appService.new_user(client);

  //   client.emit('login', uid);
  // }

  // @SubscribeMessage('get_data')
  // handleRequest(client: Socket, payload: any) {
  //   let uid = this.appService.new_user(client);

  //   client.emit('user', uid);
  // }
}

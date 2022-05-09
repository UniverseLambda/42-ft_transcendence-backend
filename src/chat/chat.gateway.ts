import { SubscribeMessage, WebSocketGateway, ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { Socket } from "socket.io";
import { AppService, ClientState } from "src/app.service";
import { ChatService } from "./chat.service";

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "chat" })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private appService: AppService, private chatService: ChatService) {}

  async handleConnection(client: Socket, ...args: any[]) {
    await this.chatService.registerConnection(this.appService, client);
  }

  handleDisconnect(client: Socket) {
    this.chatService.unregisterConnection(this.appService, client);
  }

  @SubscribeMessage("message")
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    this.chatService.onMessage(client.id, payload);
  }

  @SubscribeMessage("createRoom")
  createRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: any): string {
    return "Woops";
  }
}

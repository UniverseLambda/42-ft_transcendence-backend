import { Logger } from "@nestjs/common";
import { SubscribeMessage, WebSocketGateway, ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { Socket } from "socket.io";
import { AppService, ClientState } from "src/app.service";
import { ChatService } from "./chat.service";

@WebSocketGateway({ cors: { origin: "http://localhost:4200", credentials: true }, namespace: "chat", cookie: true })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger: Logger = new Logger(ChatGateway.name);

  constructor(private appService: AppService, private chatService: ChatService) {}

  async handleConnection(client: Socket, ...args: any[]) {
    if (!await this.chatService.registerConnection(this.appService, client)) {
      this.logger.error(`handleConnection: could not create new chat session for socket ${client.id}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.chatService.unregisterConnection(this.appService, client);
  }

  @SubscribeMessage("message")
  handleMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.onMessage(client, payload);
    } catch (reason) { this.logger.error(`handleMessage: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("createRoom")
  createRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.createRoom(client, payload);
    } catch (reason) { this.logger.error(`createRoom: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("setRoomPassword")
  setRoomOpt(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.setRoomPassword(client, payload);
    } catch (reason) { this.logger.error(`setRoomPassword: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("joinRoom")
  joinRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.joinRoom(client, payload);
    } catch (reason) { this.logger.error(`joinRoom: exception thrown: ${reason}`); }
  }

  // TODO: leaveRoom, blockUser, kickUser, muteUser, setAdmin
}

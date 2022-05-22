import { Logger } from "@nestjs/common";
import { SubscribeMessage, WebSocketGateway, ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect } from "@nestjs/websockets";
import { Socket } from "socket.io";
import { AppService, ClientState } from "src/app.service";
import { ChatService } from "./chat.service";

@WebSocketGateway({ cors: { origin: "http://localhost:4200", credentials: true }, namespace: "back/chat", cookie: true })
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

  @SubscribeMessage("leaveRoom")
  leaveRoom(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.leaveRoom(client, payload);
    } catch (reason) { this.logger.error(`leaveRoom: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("blockUser")
  blockUser(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.blockUser(client, payload);
    } catch (reason) { this.logger.error(`blockUser: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("unblockUser")
  unblockUser(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.unblockUser(client, payload);
    } catch (reason) { this.logger.error(`unblockUser: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("setBan")
  setBan(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.setBan(client, payload);
    } catch (reason) { this.logger.error(`setBan: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("kickUser")
  kickUser(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.kickUser(client, payload);
    } catch (reason) { this.logger.error(`kickUser: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("setMute")
  setMute(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.setMute(client, payload);
    } catch (reason) { this.logger.error(`setMute: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("setAdmin")
  setAdmin(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.setAdmin(client, payload);
    } catch (reason) { this.logger.error(`setAdmin: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("openConv")
  openConv(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.openConv(client, payload);
    } catch (reason) { this.logger.error(`openConv: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("letInvite")
  letInvite(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    try {
      this.chatService.letInvite(client, payload);
    } catch (reason) { this.logger.error(`letInvite: exception thrown: ${reason}`); }
  }

  @SubscribeMessage("reattach")
  reattach(@ConnectedSocket() client: Socket) {
    try {
      this.chatService.reattach(client);
    } catch (reason) { this.logger.error(`reattach: exception thrown: ${reason}`); }
  }
}

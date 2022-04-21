import { Injectable } from '@nestjs/common';
import { Socket } from 'dgram';
import axios from 'axios';

export enum AuthStatus {
  Inexistant,
  Waiting,
  Refused,
  Accepted
}

@Injectable()
export class AppService {
  private clients: any = {};

  receive_oauth_code(uid: number, code: string): boolean {
    console.log(`Received oauth code ${code} for user ${uid}`)

    this.clients[uid] = {};
    this.clients[uid].status = AuthStatus.Waiting;
    this.clients[uid].api_42_code = code;

    axios.post("https://api.intra.42.fr/oauth/token", {
      grant_type: "authorization_code",
      client_id: "3cf0f70b74141822d0e52fc4858b288427ab9e62f4892d7390827f265748bdd7",
      client_secret: "adbf532fb52a4f8e86c872a0658f0665a19f0876097cab6733f0cb9fb5a6b2e1",
      code: code,
      redirect_uri: "https://10.3.8.3:3000/login/oauth"
    }).then((response) => {
      console.log("POSITIVE RESPONSE FOR  " + uid);
      this.clients[uid].status = AuthStatus.Accepted;
    }).catch((reason) => {
      this.clients[uid].status = AuthStatus.Refused;
      console.log("Wtf: " + reason);
    });

    return true;
  }

  receive_oauth_error(uid: number) {
    console.log(`Could not authenticate user ${uid}`)

    this.clients[uid].socket.emit("login_return", false);
  }

  isAuth(uid: number): AuthStatus {
    if (!this.clients[uid]) {
      return AuthStatus.Inexistant;
    }

    return this.clients[uid].status;
  }
}


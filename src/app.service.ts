import { Injectable } from '@nestjs/common';
import { Socket } from 'dgram';
import axios from 'axios';
import { Request } from 'express';

export enum AuthStatus {
  Inexistant,
  Waiting,
  Refused,
  Accepted
}

@Injectable()
export class AppService {
  private clients: any = {};

  receiveOAuthCode(uid: number, code: string): boolean {
    console.log(`Received oauth code ${code} for user ${uid}`)

    this.clients[uid] = {};
    this.clients[uid].status = AuthStatus.Waiting;
    this.clients[uid].api_42_code = code;

    axios.post("https://api.intra.42.fr/oauth/token", {
      grant_type: "authorization_code",
      client_id: "3cf0f70b74141822d0e52fc4858b288427ab9e62f4892d7390827f265748bdd7",
      client_secret: "adbf532fb52a4f8e86c872a0658f0665a19f0876097cab6733f0cb9fb5a6b2e1",
      code: code,
      redirect_uri: `https://${this.getBackendHost()}:3000/login/oauth`
    }).then((response) => {
      console.log("POSITIVE RESPONSE FOR " + uid);
      this.clients[uid].status = AuthStatus.Accepted;
      this.clients[uid].api42Token = response.data.access_token;
    }).catch((reason) => {
      this.clients[uid].status = AuthStatus.Refused;
      console.log("Wtf: " + reason);
    });

    return true;
  }

  async retrieveUserData(uid: number) {
    if (this.clients[uid].info42) {
      return this.clients[uid].info42;
    }

    try {
      let response = await axios.get(`https://api.intra.42.fr/v2/me?access_token=${this.clients[uid].api42Token}`);
      console.log(`retrieveUserData: got status ${response.status} from api.intra.42.fr`);

      let data = response.data;
      // console.log(`response: ${JSON.stringify(data)}`);

      this.clients[uid].info42 = {
        id: data.id,
        login: data.login,
        displayName: data.displayname,
        imageUrl: data.image_url,
      };

      console.log(`result: ${JSON.stringify(this.clients[uid].info42)}`);
      return this.clients[uid].info42;
    } catch (reason) {
      console.error("retrieveUserData: Could not retrieve user info: " + reason);
    }
    return undefined;
  }

  receiveOAuthError(uid: number) {
    console.log(`Could not authenticate user ${uid}`);
    this.clients[uid].status = AuthStatus.Refused;
  }

  isAuth(uid: number): AuthStatus {
    if (!this.clients[uid]) {
      return AuthStatus.Inexistant;
    }

    return this.clients[uid].status;
  }

  checkAuthedRequest(request: Request): boolean|string {
    let uid = request.cookies['uid'];

		if (!uid) {
			return false;
		}

    return uid;
  }

  getBackendHost(): string {
    return '10.3.8.3';
  }
}

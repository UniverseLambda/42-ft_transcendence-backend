import { Injectable } from '@nestjs/common';
import { Socket } from 'dgram';
import axios from 'axios';
import { CookieOptions, Request } from 'express';
import * as jose from 'jose';

const JWT_ALG: string = "HS512";
const JWT_ISSUER: string = "ft_transcendance_BrindiSquad";

export enum AuthStatus {
  Inexistant,
  Waiting,
  Refused,
  Accepted
}

@Injectable()
export class AppService {
  private secret: Uint8Array = new Uint8Array(256);

  // private clients: any = {};

  public constructor() {
    for (let i = 0; i < 256; ++i) {
      this.secret[i] = Math.floor(Math.random() * 255);
    }
  }

  async newToken(data: any): Promise<string> {
    let token = await new jose.SignJWT(data)
      .setProtectedHeader({alg: JWT_ALG})
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      .setExpirationTime("2h")
      .sign(this.secret);

      return token.toString();
  }

  async getInitialToken(): Promise<string> {
    return await this.newToken({
      status: AuthStatus.Waiting
    });
  }

  async getTokenData(token: string): Promise<any> {
    try {
      const { payload, protectedHeader } = await jose.jwtVerify(token, this.secret, {
        algorithms: [ JWT_ALG ],
        issuer: JWT_ISSUER,
      });

      return payload;
    } catch (reason) {
      console.log("retrieveUserData: Could not read token: " + reason);
    }
  }

  async receiveOAuthCode(code: string): Promise<string> {
    console.log(`Received oauth code ${code}`)

    let data: any = {
      status: AuthStatus.Refused
    };

    try {
      let token_result = await axios.post("https://api.intra.42.fr/oauth/token", {
        grant_type: "authorization_code",
        client_id: "3cf0f70b74141822d0e52fc4858b288427ab9e62f4892d7390827f265748bdd7",
        client_secret: "adbf532fb52a4f8e86c872a0658f0665a19f0876097cab6733f0cb9fb5a6b2e1",
        code: code,
        redirect_uri: `https://${this.getBackendHost()}:3000/login/oauth`
      });

      let response = await axios.get(`https://api.intra.42.fr/v2/me?access_token=${token_result.data.access_token}`);
      console.log(`retrieveUserData: got status ${response.status} from api.intra.42.fr`);

      data = {
        status: AuthStatus.Accepted,
        id: response.data.id,
        login: response.data.login,
        displayName: response.data.displayname,
        imageUrl: response.data.image_url,
      };
    } catch (reason) {
        console.log("Wtf: " + reason);
    }

    return await this.newToken(data);
  }

  async receiveOAuthError() {
    console.log(`Could not authenticate user`);

    return {
      status: AuthStatus[AuthStatus.Refused]
    };
  }

  async retrieveUserData(token: string) {
    return this.getTokenData(token);
  }

  async isAuth(token?: string): Promise<AuthStatus> {
    if (!token) {
      return AuthStatus.Inexistant;
    }

    let data = await this.getTokenData(token);

    if (!data || !data.status || typeof data.status !== "number") {
      return AuthStatus.Inexistant;
    }

    return data.status;
  }

  async checkAuthedRequest(request: Request): Promise<boolean> {
    let cookie = request.cookies[this.getSessionCookieName()];

    if (!cookie) {
      return false;
    }

    try {
      let data = await this.getTokenData(cookie);

      return data.status === AuthStatus.Accepted;
    } catch (reason) {
      console.log("checkAuthedRequest: Could not")
    }

    return false;
  }

  getBackendHost(): string {
    return '10.3.7.3';
  }

  getSessionCookieName(): string {
    return "sessdat";
  }

  getSessionCookieOptions(): CookieOptions {
    return {sameSite: "none", secure: true};
  }
}

import { Injectable } from '@nestjs/common';
import { Socket } from 'dgram';
import axios from 'axios';
import { CookieOptions, Request } from 'express';
import { generateKeySync, KeyObject } from "crypto";
import * as jose from 'jose';
import * as fs from 'fs';
import * as path from 'path';

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
  private secret: KeyObject;

  public constructor() {
    this.secret = generateKeySync("hmac", { length: 512 });
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

  async getSessionData(req: Request): Promise<any> {
    return this.getTokenData(req.cookies[this.getSessionCookieName()]);
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

    let data: any;

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

      let imagePath = this.getAvatarPath(response.data.id);

      if (!fs.existsSync(imagePath)) {
        let fileStream = fs.createWriteStream(this.getAvatarPath(data.id));
        let imageResponse = await axios.get(data.imageUrl, { responseType: 'stream' });
        imageResponse.data.pipe(fileStream);

        console.log(`retrieveUserData: avatar retrieving: got status ${imageResponse.status} from api.intra.42.fr`);


        await new Promise((resolve, reject) => {
          imageResponse.data.on("finish", resolve);
          imageResponse.data.on("error", reject);
        });
      }

    } catch (reason) {
        console.log("Error while communicating with 42's intranet: " + reason);

        data = {
          status: AuthStatus.Refused
        };
    }

    return await this.newToken(data);
  }

  async receiveOAuthError() {
    console.log(`Could not authenticate user`);

    return await this.newToken({ status: AuthStatus.Refused });
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
      console.log(`checkAuthedRequest: Could not get token data: ${reason}`);
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

  getMaxUsernameLength(): number {
    return 64;
  }

  getAvatarPath(id: number): string {
    // Yup. Becaue we don't want to put it in the dist directory (that's nasty - IMO)
    return `${path.dirname(__dirname)}/user_data/avatar/${id}`;
  }
}

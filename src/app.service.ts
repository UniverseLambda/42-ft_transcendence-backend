import { Injectable, Logger } from "@nestjs/common";
import { Socket } from "dgram";
import axios from "axios";
import { CookieOptions, Request } from "express";
import { generateKeySync, KeyObject } from "crypto";
import * as jose from "jose";
import * as fs from "fs";
import * as path from "path";

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
  private readonly logger: Logger = new Logger(AppService.name);
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
      authStatus: AuthStatus.Waiting
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
      this.logger.warn("retrieveUserData: Could not read token: " + reason);
    }
  }

  async receiveOAuthCode(code: string): Promise<string> {
    this.logger.debug(`Received oauth code ${code}`)

    let data: any;

    try {
      let token_result = await axios.post("https://api.intra.42.fr/oauth/token", {
        grant_type: "authorization_code",
        client_id: this.getAPIClientId(),
        client_secret: this.getAPISecret(),
        code: code,
        redirect_uri: `https://${this.getBackendHost()}:3000/login/oauth`
      });

      let response = await axios.get(`https://api.intra.42.fr/v2/me?access_token=${token_result.data.access_token}`);
      this.logger.verbose(`retrieveUserData: got status ${response.status} from api.intra.42.fr`);

      data = {
        authStatus: AuthStatus.Accepted,
        userStatus: "Online",
        id: response.data.id,
        login: response.data.login,
        displayName: response.data.displayname,
        imageUrl: response.data.image_url,
      };

      let imagePath = this.getAvatarPath(response.data.id);

      if (!fs.existsSync(imagePath)) {
        this.logger.log(`retrieveUserData: no avatar found for user ${data.id}. Retrieving it from ${data.imageUrl}`);

        let fileStream = fs.createWriteStream(this.getAvatarPath(data.id));
        let imageResponse = await axios.get(data.imageUrl, { responseType: "stream" });
        imageResponse.data.pipe(fileStream);

        this.logger.verbose(`retrieveUserData: avatar retrieving: got status ${imageResponse.status} from api.intra.42.fr`);


        await new Promise((resolve, reject) => {
          imageResponse.data.on("finish", resolve);
          imageResponse.data.on("error", reject);
        });
      }

    } catch (reason) {
        this.logger.error("Error while communicating with 42's intranet: " + reason);

        data = {
          authStatus: AuthStatus.Refused
        };
    }

    return await this.newToken(data);
  }

  async receiveOAuthError() {
    this.logger.log(`Could not authenticate user`);

    return await this.newToken({ authStatus: AuthStatus.Refused });
  }

  async retrieveUserData(token: string) {
    return this.getTokenData(token);
  }

  async isAuth(token?: string): Promise<AuthStatus> {
    if (!token) {
      return AuthStatus.Inexistant;
    }

    let data = await this.getTokenData(token);

    if (!data || !data.authStatus || typeof data.authStatus !== "number") {
      return AuthStatus.Inexistant;
    }

    return data.authStatus;
  }

  async checkAuthedRequest(request: Request): Promise<boolean> {
    let cookie = request.cookies[this.getSessionCookieName()];

    if (!cookie) {
      return false;
    }

    try {
      let data = await this.getTokenData(cookie);

      return data.authStatus && data.authStatus === AuthStatus.Accepted;
    } catch (reason) {
      this.logger.error(`checkAuthedRequest: Could not get token data: ${reason}`);
    }

    return false;
  }

  getBackendHost(): string {
    return "10.3.7.3";
  }

  getAPIClientId(): string {
    return "3cf0f70b74141822d0e52fc4858b288427ab9e62f4892d7390827f265748bdd7";
  }

  getAPISecret(): string {
    return "adbf532fb52a4f8e86c872a0658f0665a19f0876097cab6733f0cb9fb5a6b2e1";
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

  getAvatarPath(id?: number): string {
    // Yup. Because we don't want to put it in the dist directory (that's nasty - IMO)
    let result = `${path.dirname(__dirname)}/user_data/avatar/`;

    if (id !== undefined) {
      result = `${result}/${id}`
    }

    return result;
  }
}

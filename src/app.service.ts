import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { CookieOptions, Request } from "express";
import { generateKeySync, KeyObject } from "crypto";
import * as jose from "jose";
import * as fs from "fs";
import * as path from "path";
import * as OAuth from "otpauth";

import * as util from "./util";

const JWT_ALG: string = "HS512";
const JWT_ISSUER: string = "ft_transcendance_BrindiSquad";

const TOTP_MAX_DELTA = 1;

export enum AuthStatus {
  Inexistant,
  Waiting,
  Refused,
  WaitingFor2FA,
  Accepted
}

export enum UserStatus {
  Unregistered,
  Invisible,
  Online,
  InGame
}

export class AuthState {
  constructor(public authStatus: AuthStatus, public id?: number) {}
}

export class UserProfile {
  constructor(
    public login: string,
    public readonly displayName: string,
    public readonly defaultAvatarUrl: string,
    public level: number = 1,
    public rank: string = "N00b",
    public win: number = 0,
    public loose: number = 0,
  ) {}
}

export class ClientState {
  public totpSecret?: OAuth.TOTP = undefined;
  public totpInPreparation: boolean = false;
  public socketCount: number = 0;

  private friendList: Set<number> = new Set();

  constructor(
    private id: number,
    public userStatus: UserStatus,
    public profile: UserProfile,
  ) {}

  public getId(): number {
    return this.id;
  }

  public getDefaultAvatarUrl(): string {
    return this.profile.defaultAvatarUrl;
  }

  public addFriend(friend: number) {
    this.friendList.add(friend);
  }

  public removeFriend(friendId: number) {
    this.friendList.delete(friendId);
  }

  public getFriendList(): number[] {
    let result: number[] = [];

    for (let f of this.friendList.keys()) {
      result.push(f);
    }

    return result;
  }
}

@Injectable()
export class AppService {
  private readonly logger: Logger = new Logger(AppService.name);
  private secret: KeyObject;

  private userMap = new Map<number, ClientState>();

  public constructor() {
    this.secret = generateKeySync("hmac", { length: 512 });
  }

  async newToken(data: AuthState): Promise<string> {
    let token = await new jose.SignJWT({
      authStatus: data.authStatus,
      id: data.id
    })
      .setProtectedHeader({alg: JWT_ALG})
      .setIssuedAt()
      .setIssuer(JWT_ISSUER)
      // .setExpirationTime("2h")
      .sign(this.secret);

      return token.toString();
  }

  async getInitialToken(): Promise<string> {
    return await this.newToken({
      authStatus: AuthStatus.Waiting
    });
  }

  async getSessionDataToken(token: string): Promise<ClientState> {
    let tokenData: AuthState = await this.getTokenData(token);

    return this.userMap.get(tokenData.id);
  }

  async getSessionData(req: Request): Promise<ClientState> {
    return this.getSessionDataToken(req.cookies[this.getSessionCookieName()]);
  }

  async getTokenData(token: string): Promise<AuthState> {
    try {
      const { payload, protectedHeader } = await jose.jwtVerify(token, this.secret, {
        algorithms: [ JWT_ALG ],
        issuer: JWT_ISSUER,
      });

      return new AuthState(payload.authStatus as AuthStatus, payload.id as number);
    } catch (reason) {
      this.logger.warn("retrieveUserData: Could not read token: " + reason);
    }
  }

  async receiveOAuthCode(code: string): Promise<string> {
    this.logger.debug(`Received oauth code ${code}`)

    let cookie: AuthState;

    try {
      let token_result = await axios.post("https://api.intra.42.fr/oauth/token", {
        grant_type: "authorization_code",
        client_id: this.getAPIClientId(),
        client_secret: this.getAPISecret(),
        code: code,
        redirect_uri: `https://${util.getBackendHost()}${util.getBackendPrefix()}/login/oauth`
      });

      let response = await axios.get(`https://api.intra.42.fr/v2/me?access_token=${token_result.data.access_token}`);
      this.logger.verbose(`retrieveUserData: got status ${response.status} from api.intra.42.fr`);


      if (!this.userMap.has(response.data.id)) {
        let data: ClientState = new ClientState(
          response.data.id,
          UserStatus.Online,
          new UserProfile(
            response.data.login,
            response.data.displayname,
            response.data.image_url,
          )

          // TODO: ADD DATA TO DATABASE
        );

        this.userMap.set(data.getId(), data);
      }

      let userData = this.userMap.get(response.data.id);

      if (userData.totpSecret && !userData.totpInPreparation) {
        cookie = new AuthState(AuthStatus.WaitingFor2FA, response.data.id);
      } else {
        cookie = new AuthState(AuthStatus.Accepted, response.data.id);
      }

    } catch (reason) {
        this.logger.error("Error while communicating with 42's intranet: " + reason);

        cookie = new AuthState(AuthStatus.Refused);
    }

    return await this.newToken(cookie);
  }

  async receiveOAuthError() {
    this.logger.log(`Could not authenticate user`);

    return await this.newToken({ authStatus: AuthStatus.Refused });
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

      return data && data.authStatus && data.authStatus === AuthStatus.Accepted;
    } catch (reason) {
      this.logger.error(`checkAuthedRequest: Could not get token data: ${reason}`);
    }

    return false;
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

  getMaxLoginLength(): number {
    return 64;
  }

  getAvatarUrl(user: ClientState): string {
    return `https://${util.getBackendHost()}${util.getBackendPrefix()}/profile/avatar/${user.getId()}`;
  }

  getClientState(id: number): ClientState {
    return this.userMap.get(id);
  }

  async downloadAvatarIfMissing(id: number): Promise<boolean> {
    if (!fs.existsSync(this.getAvatarPath(id))) {
      try {
        await this.downloadDefaultAvatar(id);
      } catch (reason) {
        this.logger.error("Could not retrieve avatar from 42's intranet");
        return false;
      }
    }
    return true;
  }

  async downloadDefaultAvatar(id: number) {
    let imagePath = this.getAvatarPath(id);
    let sess = this.userMap.get(id);

    this.logger.log(`retrieveUserData: no avatar found for user ${id}. Retrieving it from ${sess.getDefaultAvatarUrl()}`);

    this.ensureFileOps(imagePath);

    let fileStream = fs.createWriteStream(imagePath);
    let imageResponse = await axios.get(sess.getDefaultAvatarUrl(), { responseType: "stream" });
    imageResponse.data.pipe(fileStream);

    this.logger.verbose(`retrieveUserData: avatar retrieving: got status ${imageResponse.status} from api.intra.42.fr`);

    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });
  }

  getAvatarPath(id?: number): string {
    // Yup. Because we don't want to put it in the dist directory (that's nasty - IMO)
    let result = util.getAvatarStoragePath();

    if (id !== undefined) {
      result = `${result}/${id}`
    }

    return result;
  }

  async prepare2FA(sess: ClientState): Promise<string> {
    if (sess.totpInPreparation && sess.totpSecret) {
      return sess.totpSecret.toString();
    }

    if (sess.totpSecret) {
      throw `prepare2FA: TOTP already activated for user ${sess.getId()} (${sess.profile.login})`;
    }

    sess.totpSecret = new OAuth.TOTP({
      label: "BrindiSquad 2FA",
      issuer: "BrindiSquad",
      algorithm: "SHA512",
      digits: 6,
      period: 30,
      secret: new OAuth.Secret(generateKeySync("hmac", {length: 512}).export())
    })

    sess.totpInPreparation = true;

    this.logger.debug(`SECRET: ${sess.totpSecret.toString()}`);
    return sess.totpSecret.toString();
  }

  async validate2FA(sess: ClientState, token: string): Promise<boolean> {
    if (!sess.totpInPreparation) {
      throw `validate2FA: TOTP not in preparation for user ${sess.getId()} (${sess.profile.login})`;
    }

    if (!sess.totpSecret) {
      throw `validate2FA: no TOTP secret generated while being in preparation for user ${sess.getId()} (${sess.profile.login})`;
    }

    let valid: boolean = await this.check2FA(sess, token);

    if (valid) {
      // TODO: Store TOTP secret in database
      sess.totpInPreparation = false;
      return true;
    }

    return false;
  }

  async login2FA(sess: ClientState, token: string): Promise<boolean> {
    if (sess.totpInPreparation) {
      throw `login2FA: TOTP in preparation for user ${sess.getId()} (${sess.profile.login})`;
    }

    if (!sess.totpSecret) {
      throw `login2FA: no TOTP secret generated while being activated for user ${sess.getId()} (${sess.profile.login})`;
    }

    return this.check2FA(sess, token);
  }

  async check2FA(sess: ClientState, token: string): Promise<boolean> {
    let result: number = sess.totpSecret.validate({token: token});

    this.logger.debug(`check2FA: TOKEN: ${token}, DELTA: ${result}`);

    return result != null && result <= TOTP_MAX_DELTA;
  }

  deactivate2FA(sess: ClientState) {
    this.logger.debug(`deactivate2FA: 2FA for ${sess.getId()}`);

    sess.totpSecret = undefined;
    sess.totpInPreparation = false;
  }

  addFriend(sess: ClientState, targetId: number): any {
    let target = this.getClientState(targetId);

    this.logger.debug(`addFriend: client ${sess.getId()} (${sess.profile.login}) added ${targetId} to their friends`);

    if (target !== undefined) {
      target.addFriend(sess.getId());
    }

    sess.addFriend(targetId);

    // TODO: addFriend: Flush to db

    return { success: "YAY" };
  }

  removeFriend(sess: ClientState, targetId: number): any {
    let target = this.getClientState(targetId);

    this.logger.debug(`removeFriend: client ${sess.getId()} (${sess.profile.login}) removed ${targetId} to their friends`);

    if (target !== undefined) {
      target.removeFriend(sess.getId());
    }

    sess.removeFriend(targetId);

    // TODO: addFriend: Flush to db

    return { success: "YAY" };
  }

  getFriendList(sess: ClientState): any[] {
    let friendList: any[] = [];

    for (let f of sess.getFriendList()) {
      let curr: ClientState = this.getClientState(f);
      let data: any;

      if (curr === undefined) {
        // TODO: getFriendList: get data from DB
        data = {
          id: f,
          login: "XXXXXXXXXXX",
          level: 0,
          rank: "???????",
          userStatus: "Offline",
        }
      } else {
        data = {
          id: f,
          login: curr.profile.login,
          level: curr.profile.level,
          rank: curr.profile.rank,
          userStatus: UserStatus[curr.userStatus],
        }
      }

      friendList.push(data);
    }
    return friendList;
  }

  reviveUser(id: number, force: boolean = false) {
    if (force || this.getClientState(id) === undefined) {
      // TODO: reviveUser: retrieve client state from DB
    }
  }

  flushUser() {
    // TODO: flushUser: flush client state to DB
  }

  ensureFileOps(p: string): boolean {
    fs.mkdirSync(path.dirname(p), {recursive: true});
    return true;
  }

  inGame(id: number) {
    let client = this.getClientState(id);

    if (!client) {
      this.logger.error(`inGame: no user ${id} currently connected`);
      return;
    }

    client.userStatus = UserStatus.InGame;
  }

  gameQuitted(id: number) {
    let client = this.getClientState(id);

    if (!client) {
      this.logger.error(`gameQuitted: no user ${id} currently connected`);
      return;
    }

    client.userStatus = UserStatus.Online;
  }

  socketConnected(id: number) {
	 this.logger.debug(`[APPSERVICE] Socket ${id} connected.`);
    this.getClientState(id).socketCount += 1;
  }

  socketDisconnected(id: number) {
	 this.logger.debug(`[APPSERVICE] Socket ${id} disconnected.`);
    let client: ClientState = this.getClientState(id);

	 if (client === undefined) {
		 this.logger.error(`socketDisconnected: no client for id ${id}`);
		 return;
	 }

    client.socketCount -= 1;

    if (client.socketCount === 0) {
		 this.logger.warn(`socketDisconnected: cleaning up data of user ${client.getId()}`);
      // TODO: socketDisconnected: flush data to database
      this.userMap.delete(id);
    }
  }
}

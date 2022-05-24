import { Injectable, Logger } from "@nestjs/common";
import axios from "axios";
import { CookieOptions, Request } from "express";
import { generateKeySync, KeyObject } from "crypto";
import * as jose from "jose";
import * as fs from "fs";
import * as path from "path";
import * as OAuth from "otpauth";

import { Client } from "pg";

import * as util from "./util";

const JWT_ALG: string = "HS512";
const JWT_ISSUER: string = "ft_transcendance_BrindiSquad";

const TOTP_MAX_DELTA = 1;

export enum AuthStatus {
  Inexistant,
  Waiting,
  Refused,
  WaitingFor2FA,
  Accepted,
  AlreadyConnected,
}

export enum UserStatus {
  Offline,
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
    public xp: number = 0,
    public rank: string = "N00b",
    public win: number = 0,
    public loose: number = 0,
    public totpSecret: OAuth.TOTP = undefined,
    public hotpCounter: number = 0,
  ) {}
}

export class ClientState {
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

  private sqlConn: Client;

  private userMap: Map<number, ClientState> = new Map();

  public constructor() {
    this.secret = generateKeySync("hmac", { length: 512 });

    if (!util.isLocal()) {
      this.sqlConn = new Client({
        host: process.env.IP_DATABASE,
        port: Number.parseInt(process.env.PORT_DATABASE),
        user: process.env.POSTGRES_USER,
        password: "test_password",
        database: process.env.POSTGRES_DB });
      this.sqlConn.connect();
    }
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

    await this.reviveUser(tokenData.id);
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

      // If we have the data but this function is still called, then the guy is waiting for 2FA
      if (this.getClientState(response.data.id) !== undefined) {
        if (this.getClientState(response.data.id).profile.totpSecret !== undefined) {
          return await this.newToken(new AuthState(AuthStatus.WaitingFor2FA, response.data.id));
        } else {
          return await this.newToken(new AuthState(AuthStatus.Accepted, response.data.id));
        }
      }

      let sqlResult: UserProfile = await this.getUserInfo(response.data.id);
      let userProfile: UserProfile;


      if (sqlResult) {
        userProfile = sqlResult;
      } else {
        let login: string = response.data.login;
        let currLogin: string = login;
        let currAdd: number = 0;
        let available: boolean;

        while (!(available = await this.isNameAvailable(currLogin)) && currAdd < 10000) {
          currLogin = login + (currAdd);
          currAdd += 1;
        }

        if (!available) {
          this.logger.error(`receiveOAuthCode: no available login found (WTF)`);
          return await this.newToken(new AuthState(AuthStatus.Refused));
        }

        userProfile = new UserProfile(response.data.login, response.data.displayname, response.data.image_url);
        await this.registerUser(response.data.id, userProfile);
      }

      let data: ClientState = new ClientState(
        response.data.id,
        UserStatus.Online,
        userProfile
      );


      if (data.profile.totpSecret && !data.totpInPreparation) {
        cookie = new AuthState(AuthStatus.WaitingFor2FA, response.data.id);
      } else {
        cookie = new AuthState(AuthStatus.Accepted, response.data.id);
      }

      this.userMap.set(data.getId(), data);
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

  getAvatarUrl(user: number): string {
    return `https://${util.getBackendHost()}${util.getBackendPrefix()}/profile/avatar/${user}`;
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
    if (sess.totpInPreparation && sess.profile.totpSecret) {
      return sess.profile.totpSecret.toString();
    }

    if (sess.profile.totpSecret) {
      throw `prepare2FA: TOTP already activated for user ${sess.getId()} (${sess.profile.login})`;
    }

    sess.profile.totpSecret = new OAuth.TOTP({
      label: "BrindiSquad 2FA",
      issuer: "BrindiSquad",
      algorithm: "SHA512",
      digits: 6,
      period: 30,
      secret: new OAuth.Secret(generateKeySync("hmac", {length: 512}).export())
    })

    sess.totpInPreparation = true;

    this.logger.verbose(`prepare2FA: totpSecret ready to be enabled :)`);
    // this.logger.debug(`SECRET: ${sess.profile.totpSecret.toString()}`);
    return sess.profile.totpSecret.toString();
  }

  async validate2FA(sess: ClientState, token: string): Promise<boolean> {
    if (!sess.totpInPreparation) {
      throw `validate2FA: TOTP not in preparation for user ${sess.getId()} (${sess.profile.login})`;
    }

    if (!sess.profile.totpSecret) {
      throw `validate2FA: no TOTP secret generated while being in preparation for user ${sess.getId()} (${sess.profile.login})`;
    }

    let valid: boolean = await this.check2FA(sess, token);

    if (valid) {
      this.execSql("UPDATE users SET totpsecret = $1 WHERE uid = $2;", sess.profile.totpSecret, sess.getId());
      sess.totpInPreparation = false;
      return true;
    } else {
      this.logger.verbose(`validate2FA: wrong response value`);
    }

    return false;
  }

  async login2FA(sess: ClientState, token: string): Promise<boolean> {
    if (sess.totpInPreparation) {
      throw `login2FA: TOTP in preparation for user ${sess.getId()} (${sess.profile.login})`;
    }

    if (!sess.profile.totpSecret) {
      throw `login2FA: no TOTP secret generated while being activated for user ${sess.getId()} (${sess.profile.login})`;
    }

    return this.check2FA(sess, token);
  }

  async check2FA(sess: ClientState, token: string): Promise<boolean> {
    let result: number = sess.profile.totpSecret.validate({token: token});

    this.logger.debug(`check2FA: TOKEN: ${token}, DELTA: ${result}`);

    let valid = result != null && result <= TOTP_MAX_DELTA;

    if (valid) {
      sess.profile.hotpCounter += 1;
      this.execSql("UPDATE users SET hotpcounter = $1 WHERE uid = $2;", [sess.getId(), sess.profile.hotpCounter]);
    }

    return valid;
  }

  deactivate2FA(sess: ClientState) {
    this.logger.debug(`deactivate2FA: 2FA for ${sess.getId()}`);

    sess.profile.totpSecret = undefined;
    sess.totpInPreparation = false;

    this.execSql("UPDATE users SET totpsecret = 'NULL' WHERE uid = $1;", sess.getId());
  }

  addFriend(sess: ClientState, targetId: number): any {
    let target = this.getClientState(targetId);

    this.logger.debug(`addFriend: client ${sess.getId()} (${sess.profile.login}) added ${targetId} to their friends`);

    if (target !== undefined) {
      target.addFriend(sess.getId());
    }

    sess.addFriend(targetId);

    let id0 = Math.min(sess.getId(), targetId);
    let id1 = Math.max(sess.getId(), targetId);

    this.execSql("INSERT INTO friendlist (id_user1, id_user2) VALUES ($1, $2);", id0, id1);

    return { success: "YAY" };
  }

  removeFriend(sess: ClientState, targetId: number): any {
    let target = this.getClientState(targetId);

    this.logger.debug(`removeFriend: client ${sess.getId()} (${sess.profile.login}) removed ${targetId} to their friends`);

    if (target !== undefined) {
      target.removeFriend(sess.getId());
    }


    let id0 = Math.min(sess.getId(), targetId);
    let id1 = Math.max(sess.getId(), targetId);

    sess.removeFriend(targetId);

    this.execSql("DELETE FROM friendlist WHERE id_user1 = $1 AND id_user2 = $2;", id0, id1);

    return { success: "YAY" };
  }

  async getFriendList(sess: ClientState): Promise<any[]> {
    let friendList: any[] = [];

    let result = await this.retrieveFriendList(sess.getId());

    for (let fid of result) {
      let friendPrf = await this.getUserInfo(fid);
      let state: ClientState = this.getClientState(fid);

      let status: UserStatus = (state) ? state.userStatus : UserStatus.Offline;

      friendList.push({
        id: fid,
        login: friendPrf.login,
        level: this.calcLevel(friendPrf.xp),
        rank: friendPrf.rank,
        userStatus: UserStatus[status],
      });
    }

    return friendList;
  }

  async roomRemoveUser(roomId: number, userId: number): Promise<boolean> {
    await this.setRoomAdmin(roomId, userId, false);

    const req = "DELETE FROM participants WHERE room_id = $1 AND user_id = $2;";

    return this.execSql(req, roomId, userId);
  }

  async removeEmptyRoom(roomId: number): Promise<boolean> {
    const reqBan = "DELETE FROM blacklist WHERE id_user1 = $1;";

    if (!await this.execSql(reqBan, roomId))
      return false;

    const req = "DELETE FROM rooms WHERE identifiant = $1;";

    return this.execSql(req, roomId);
  }

  async validateRoomPassword(roomId: number, password?: string): Promise<boolean> {
    const req = (password === undefined || password === null || password.length === 0)
    ? "SELECT * FROM rooms WHERE identifiant = $1 AND room_password = $2;"
    : "SELECT * FROM rooms WHERE identifiant = $1 AND room_password = (CRYPT($2, room_password));"
    ;

    try {
      if (password === undefined || password.length === 0) password = null;

      return (await this.sqlConn.query(req, [roomId, password])).rowCount !== 0;
    } catch (reason) {
      this.logger.error(`validateRoomPassword: querying error: ${reason}`);
    }
    return false;
  }

  async addUserToRoom(roomId: number, userId: number): Promise<boolean> {
    const req = "INSERT INTO participants (room_id, user_id) VALUES($1, $2);";

    return this.execSql(req, roomId, userId);
  }

  async userBlocked(blocker: number, blocking: number): Promise<boolean> {
    const req = "INSERT INTO blacklist (id_user1, id_user2) VALUES($1, $2);";

    return this.execSql(req, blocker, blocking);
  }

  async userUnblocked(blocker: number, blocking: number): Promise<boolean> {
    const req = "DELETE FROM blacklist WHERE id_user1 = $1 AND id_user2 = $2;";

    return this.execSql(req, blocker, blocking);
  }

  async setRoomUserBan(roomId: number, userId: number, action: boolean): Promise<boolean> {
    if (action) {
      return this.userBlocked(roomId, userId);
    } else {
      return this.userUnblocked(roomId, userId);
    }
  }

  async setRoomAdmin(roomId: number, userId: number, action: boolean): Promise<boolean> {
    const req = (action)
      ? "INSERT INTO rooms_admins (room_id, user_id) VALUES ($1, $2);"
      : "DELETE FROM rooms_admins WHERE room_id = $1 AND user_id = $2;";

    return this.execSql(req, roomId, userId);
  }

  async getHistoryList(userId: number): Promise<{otherId: number, versus: string, score: string, status: string}[]> {
    const req = "SELECT * FROM matches_history WHERE id_user1 = $1 OR id_user2 = $1;";

    try {
      let sqlRes = await this.sqlConn.query(req, [userId]);
      let result: {otherId: number, versus: string, score: string, status: string}[] = [];

      for (let r of sqlRes.rows) {
        let scoreCurrent = (r.id_user1 === userId) ? r.score_user1 : r.score_user2;
        let scoreOther = (r.id_user1 === userId) ? r.score_user2 : r.score_user1;
        let otherId = (r.id_user1 === userId) ? r.id_user2 : r.id_user1;

        let otherPrf = await this.getUserInfo(otherId);

        result.push({
          otherId: otherId,
          versus: otherPrf.login,
          status: (r.winner === userId) ? "Win" : "Losse",
          score: `${scoreCurrent} - ${scoreOther}`,
        })
      }

      return result;
    } catch (reason) {
      this.logger.error(`validateRoomPassword: querying error: ${reason}`);
    }
    return [];
  }

  async reviveUser(id: number, force: boolean = false): Promise<boolean> {
    if (force || this.getClientState(id) === undefined) {
      let res = await this.getUserInfo(id);

      if (!res) {
        this.logger.error(`reviveUser: could not revive user ${id} (res === ${res})`);
        return false;
      }

      this.userMap.set(id, new ClientState(id, UserStatus.Online, res));
    }
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
    this.getClientState(id).socketCount += 1;
  }

  socketDisconnected(id: number) {
    let client: ClientState = this.getClientState(id);

    client.socketCount -= 1;

    if (client.socketCount === 0) {
      this.userMap.delete(id);
    }
  }

  async retrieveRoomList(): Promise<{name: string, id: number, isPrivate: boolean, owner: number}[]> {
    const req = "SELECT * FROM rooms";

    try {
      let sqlResult = await this.sqlConn.query(req);

      let result: {name: string, id: number, isPrivate: boolean, owner: number}[] = [];

      for (let row of sqlResult.rows) {
        result.push({name: row.room_name, id: row.identifiant, isPrivate: row.description === "private", owner: row.owner_id});
      }

      return result;
    } catch (reason) {
      this.logger.debug(`retrieveRoomList: error while database querying: ${reason}`);
    }
    return [];
  }

  async getRoomAdmins(id: number): Promise<number[]> {
    const req = "SELECT user_id FROM rooms_admins WHERE room_id = $1;";

    try {
      let sqlResult = await this.sqlConn.query(req, [id]);

      let res: number[] = [];

      for (let i of sqlResult.rows) {
        res.push(i.user_id);
      }

      return res;
    } catch (reason) {
      this.logger.debug(`getRoomAdmins: error while database querying: ${reason}`);
    }
    return [];
  }

  async getRoomBanlist(id: number): Promise<number[]> {
    const req = "SELECT id_user2 FROM blacklist WHERE id_user1 = $1;";

    try {
      let sqlResult = await this.sqlConn.query(req, [id]);

      let res: number[] = [];

      for (let i of sqlResult.rows) {
        res.push(i.user_id);
      }

      return res;
    } catch (reason) {
      this.logger.debug(`getRoomBanlist: error while database querying: ${reason}`);
    }
    return [];
  }

  async getRoomMembers(id: number): Promise<number[]> {
    const req = "SELECT user_id FROM participants WHERE room_id = $1;";

    try {
      let sqlResult = await this.sqlConn.query(req, [id]);

      let res: number[] = [];

      for (let i of sqlResult.rows) {
        res.push(i.user_id);
      }

      return res;
    } catch (reason) {
      this.logger.debug(`getRoomMembers: error while database querying: ${reason}`);
    }
    return [];
  }

  async addRoom(id: number, name: string, isPrivate: boolean, password: string, ownerId: number): Promise<boolean> {
    const req = (password === undefined)
    ? "INSERT INTO rooms (room_name, description, room_password, identifiant, owner_id) VALUES ($1, $2, $3, $4, $5);"
    : "INSERT INTO rooms (room_name, description, room_password, identifiant, owner_id) VALUES ($1, $2, CRYPT($3, GEN_SALT('md5')), $4, $5);"
    ;

    if (password === undefined) password = null;

    return this.execSql(req, name, (isPrivate) ? "private" : "public", password, id, ownerId);
  }

  async setNewLogin(client: ClientState, newLogin: string): Promise<boolean> {
    if (await this.execSql("UPDATE users SET login = $1 WHERE uid = $2;", newLogin, client.getId())) {
      client.profile.login = newLogin;
      return true;
    }
    return false;
  }

  async getUserInfo(id: number): Promise<UserProfile> {
    const req = "SELECT * FROM users WHERE uid = $1";

    try {
      let result = await this.sqlConn.query(req, [id]);

      if (result.rowCount === 0) return null;

      let row = result.rows[0];

      let hotpSecret = undefined;

      if (row.totpsecret === null) {
        hotpSecret = OAuth.URI.parse(result.rows[0]);
        hotpSecret.counter = row.hotpcounter;
      }

      return new UserProfile(
        row.login, row.displayName, row.profile_pic, row.level, row.rank, row.wins, row.losses,
        hotpSecret, row.hotpcounter
      );
    } catch (reason) {
      this.logger.debug(`getUserInfo: error while database querying: ${reason}`);
    }
    return null;
  }

  async retrieveFriendList(id: number): Promise<number[]> {
    const req = "SELECT * FROM friendlist WHERE id_user1 = $1 OR id_user2 = $1";

    try {
      let sqlResult = await this.sqlConn.query(req, [id]);

      let result: number[] = [];

      for (let row of sqlResult.rows) {
        result.push((row.id_user1 === id) ? row.id_user2 : row.id_user1);
      }

      return result;
    } catch (reason) {
      this.logger.debug(`getUserInfo: error while database querying: ${reason}`);
    }
    return [];
  }

  async registerUser(id: number, prf: UserProfile): Promise<boolean> {
    const req = "INSERT INTO users (login, nickname, profile_pic, uid) VALUES ($1, $2, $3, $4);";

    return this.execSql(req, prf.login, prf.displayName, prf.defaultAvatarUrl, id);
  }

  // async setLogin(id: number, newLogin: string): Promise<boolean> {
  //   const req = "UPDATE users SET login = $1 WHERE uid = $2;";

  //   return this.execSql(req, newLogin, id);
  // }

  async setPassword(roomId: number, newPassword: string): Promise<boolean> {
    const req =  newPassword === undefined
      ? "UPDATE rooms SET room_password = CRYPT($1, GEN_SALT('md5')) WHERE identifiant = $2;"
      : "UPDATE rooms SET room_password = $1 WHERE identifiant = $2;";

    if (newPassword === undefined) newPassword = null;

    return this.execSql(req, newPassword, roomId);
  }

  async updateStats(userId: number, hasWon: boolean) {
    const reqProfiles = "UPDATE users SET wins = $2, losses = $3, level = $4 WHERE uid = $1;";

    let info = await this.getUserInfo(userId);

    if (hasWon) {
      info.win += 1;
    } else {
      info.loose += 1;
    }

    info.xp += (hasWon) ? 25 : 5;

    if (info.xp > (50 * 100)) {
      info.xp = (50 * 100);
    }

    return this.execSql(reqProfiles, userId, info.win, info.loose, info.xp);
  }

  async isNameAvailable(name: string): Promise<boolean> {
    const req = "SELECT * FROM users WHERE login = $1"

    try {
      let sqlResult = await this.sqlConn.query(req, [name]);

      return sqlResult.rowCount === 0;
    } catch (reason) {
      this.logger.debug(`getUserInfo: error while database querying: ${reason}`);
    }
  }

  async execSql(req: string, ...data: any[]): Promise<boolean> {
    try {
      await this.sqlConn.query(req, data);

      return true;
    } catch (reason) {
      this.logger.debug(`execSql: error while database querying: ${reason}`);
    }
    return false;
  }

  async gameEnded(ids: {p1: number, p2: number}, winner: number, scores: {score1: number, score2: number}): Promise<boolean> {
    if (!await this.updateStats(ids.p1, ids.p1 === winner)
    || !await this.updateStats(ids.p2, ids.p2 === winner)) {
      return false;
    }

    let id0  = Math.min(ids.p1, ids.p2);
    let id1  = Math.max(ids.p1, ids.p2);
    let score0 = (ids.p1 < ids.p2) ? scores.score1 : scores.score2;
    let score1 = (ids.p1 > ids.p2) ? scores.score1 : scores.score2;

    this.logger.debug(`CCCCCCCCCCCC GAMEENDED CALLED id0: ${id0}, id1: ${id1}, score0: ${score0}, score1: ${score1}`);

    const req = "INSERT INTO matches_history (id_user1, score_user1, id_user2, score_user2, winner) VALUES ($1, $2, $3, $4, $5);";

    return await this.execSql(req, id0, score0, id1, score1, winner);
  }

  calcLevel(xp: number): number {
    return Math.floor(xp / 100) ;
  }
}

import { Lobby } from '../Lobby';
import { Player, escapeUserName } from '../Player';
import { LobbyPlugin } from './LobbyPlugin';
import { BanchoResponseType } from '../parsers/CommandParser';
import { BeatmapRepository, FetchBeatmapError, FetchBeatmapErrorReason } from '../webapi/BeatmapRepository';
import { WebApiClient } from '../webapi/WebApiClient';
import { getSkills, calculateStats } from '../helpers/extraCommands'
import { UserScore } from '../webapi/HistoryTypes';
import { UserProfile } from '../webapi/UserProfile';
import { timeAgo } from '../db/helpers';

/**
 * Get beatmap mirror link from Beatconnect
 * Use !mirror to fetch the mirror link
 */
export class MiscLoader extends LobbyPlugin {
  canResend: boolean = true;
  beatconnectURL: string = 'https://beatconnect.io/b/${beatmapset_id}';
  nerinyanURL: string = 'https://api.nerinyan.moe/d/${beatmapset_id}?novideo=1';
  canSeeRank: boolean = false;
  lastUsageMap: Map<string, number> = new Map();
  playerCooldown: number = 2 * 60 * 1000; // 2 minutes
  globalCooldown: number = 30 * 1000; // 30 seconds
  lastInvokedSkill: number = 0;
  lastInvokedRs: number = 0;
  constructor(lobby: Lobby) {
    super(lobby, 'MiscLoader', 'miscLoader');
    if (WebApiClient.available) {
      this.canSeeRank = true;
    }
    this.registerEvents();
  }

  private registerEvents(): void {
    this.lobby.ReceivedChatCommand.on(a => this.onReceivedChatCommand(a.command, a.param, a.player));
    this.lobby.ReceivedBanchoResponse.on(a => {
      if (a.response.type === BanchoResponseType.BeatmapChanged) {
        this.canResend = true;
      }
    });
  }

  private async onReceivedChatCommand(command: string, param: string, player: Player): Promise<void> {
    if (command === '!mirror') {
      if (this.canResend) {
        this.checkMirror(this.lobby.mapId);
      }
    }
    // else if(command === '!skills') {
    //   this.handleSkillsCommand(player, param);
    // }
    else if(command === '!rs') {
      this.handleRecentScoreCommand(player);
    }
  }

  async handleRecentScoreCommand(player: Player): Promise<void> {
    const currentTime = Date.now();
    if (currentTime - this.lastInvokedSkill < this.globalCooldown) {
        this.lobby.SendMessage(`The command is on cooldown. Please wait ${Math.ceil((this.globalCooldown - (currentTime - this.lastInvokedSkill)) / 1000)} seconds`);
        return;
      }
    this.lastInvokedRs = currentTime;
    try{
      let recentScores: UserScore[] = [];
      if(player.id){
        recentScores = await WebApiClient.getRecentScores(player.id);
      }
      else{
        this.lobby.SendMessage(`An error occurred while fetching recent scores for ${player.name}`);
        return;
      }
      if (recentScores.length === 0) {
        this.lobby.SendMessage(`No recent scores found for ${player.name}`);
        return;
      }
      const rs = recentScores[0];
      const rsMsg = `${player.name}'s recent score is a ${rs.rank} rank ${(rs.accuracy*100).toFixed(2)}% on [https://osu.ppy.sh/b/${rs.beatmap.id} ${rs.beatmapset.title.substring(0, 15)}... [${rs.beatmap.version}]]${rs.mods.length>0?` with ${rs.mods.join("")} `:" "}worth ${rs.pp?Math.round(rs.pp):0}pp! (Updated ${timeAgo(rs.created_at)})`;
      this.lobby.SendMessage(rsMsg);
    } catch (e: any) {
      this.logger.error(`@MiscLoader#handleRecentScoreCommand: There was an error while fetching recent scores for ${player.escaped_name}\n${e.message}\n${e.stack}`);
      this.lobby.SendMessage(`An error occurred while fetching recent scores for ${player.name}`);
      return;
    }
  }

  async getStats(param: string): Promise<string> {
    let id = 0;
    const username = escapeUserName(param);
    if (this.lobby.playersMap.has(username)) {
      id = this.lobby.playersMap.get(username)!.id;
    }
    else{
      const user: UserProfile | null = await WebApiClient.getUser(username);
      if (user){
        id = user.id;
      }
    }
    if (id === 0){
      return "";
    }
    let bestScores: UserScore[] = [];
    try{
      bestScores = await WebApiClient.getBestScores(id);
    } catch (e: any) {
      this.logger.error(`@MiscLoader#getStats: There was an error while fetching best scores for ${id}\n${e.message}\n${e.stack}`);
      return "";
    }
    const statsMsg = calculateStats(bestScores, id, param)
    return statsMsg;
  }

  async handleSkillsCommand(player: Player, param: string): Promise<void> {
    const currentTime = Date.now();
    if (currentTime - this.lastInvokedSkill < this.globalCooldown) {
        this.lobby.SendMessage(`The command is on cooldown. Please wait ${Math.ceil((this.globalCooldown - (currentTime - this.lastInvokedSkill)) / 1000)} seconds`);
        return;
      }
    const lastUsageTime = this.lastUsageMap.get(player.escaped_name);
    if (lastUsageTime && (currentTime - lastUsageTime < this.playerCooldown)) {
      this.lobby.SendMessage(`${player.name}, please wait ${Math.ceil((this.playerCooldown - (currentTime - lastUsageTime)) / 1000)} seconds before using this command again.`);
      return;
    }
    if(param===''){
      this.lobby.SendMessage('Please specify a username! Usage: !skills <username>');
      return;
    }
    this.lastInvokedSkill = currentTime;
    this.lastUsageMap.set(player.escaped_name, currentTime);

    // const skillsMsg: string = await getSkills(param);
    // const statsMsg: string = await this.getStats(param);
    const [skillsMsg, statsMsg] = await Promise.all([getSkills(param),this.getStats(param)]);
    this.lobby.SendMessage(skillsMsg+statsMsg);
  }

  async checkMirror(mapId: number): Promise<void> {
    try {
      const map = await BeatmapRepository.getBeatmap(mapId, this.lobby.gameMode);
      this.canResend = false;
      if (!map) {
        this.lobby.SendMessage('The current beatmap doesn\'t have a mirror.');
        this.canResend = false;
        return;
      }
      this.canResend = true;
      const beatconnectLink = this.beatconnectURL.replace(/\$\{beatmapset_id\}/g, map.beatmapset_id.toString());
      const nerinyanLink = this.nerinyanURL.replace(/\$\{beatmapset_id\}/g, map.beatmapset_id.toString());
      const beatmapView = map.beatmapset?.title.toString();
      this.lobby.SendMessageWithCoolTime(`Alternative download link for beatmap ${beatmapView}: [${beatconnectLink} BeatConnect.io] | [${nerinyanLink} NeriNyan.moe]`, '!mirror', 5000);
    } catch (e: any) {
      this.canResend = false;
      if (e instanceof FetchBeatmapError) {
        switch (e.reason) {
          case FetchBeatmapErrorReason.FormatError:
            this.logger.error(`Failed to parse the webpage. Checked beatmap: ${mapId}`);
            break;
          case FetchBeatmapErrorReason.NotFound:
            this.logger.info(`Beatmap cannot be found. Checked beatmap: ${mapId}`);
            break;
          case FetchBeatmapErrorReason.PlayModeMismatched:
            this.logger.info(`Gamemode mismatched. Checked beatmap: ${mapId}`);
            break;
          case FetchBeatmapErrorReason.NotAvailable:
            this.logger.info(`Beatmap is not available. Checked beatmap: ${mapId}`);
            break;
        }
      } else {
        this.logger.error(`@MiscLoader#checkMirror: There was an error while checking beatmap ${mapId}\n${e.message}\n${e.stack}`);
      }
    }
  }
}

import { Lobby } from '../Lobby';
import { Player, escapeUserName } from '../Player';
import { LobbyPlugin } from './LobbyPlugin';
import { WebApiClient } from '../webapi/WebApiClient';
import { UserProfile } from '../webapi/UserProfile';
import { getConfig } from '../TypedConfig';

export interface ProfileFetcherOption {
  allow_players_pp: [number, number],
  under_range_msg: string,
  over_range_msg: string,
  profile_expired_day: number
}


export class ProfileFetcher extends LobbyPlugin {
  option: ProfileFetcherOption;
  profileMap: Map<string, UserProfile>;
  pendingNames: Set<string>;
  task: Promise<void>;

  constructor(lobby: Lobby, option: Partial<ProfileFetcherOption> = {}) {
    super(lobby, 'profile', 'profile');
    this.option = getConfig(this.pluginName, option) as ProfileFetcherOption;
    this.profileMap = new Map<string, UserProfile>();
    this.pendingNames = new Set<string>();
    this.task = this.initializeAsync();
    this.registerEvents();
  }

  private async initializeAsync(): Promise<void> {
    try{
      await WebApiClient.updateToken();
    }
    catch (e: any) {
      this.logger.error(`@ProfileFetcher#initializeAsync\n${e.message}\n${e.stack}`);
    }
  }

  private registerEvents(): void {
    this.lobby.PlayerJoined.on(a => this.onPlayerJoined(a.player));
  }

  private onPlayerJoined(player: Player): void {
    this.addTaskQueueIfNeeded(player);
  }

  private addTaskQueueIfNeeded(player: Player): boolean {

    if (player.id !== 0) return false;
    const profile = this.profileMap.get(player.name);
    if (profile && !this.isExpiredProfile(profile)) {
      player.id = profile.id;
      player.profile = profile;
      return true;
    }

    if (this.pendingNames.has(player.name)) {
      return false;
    }
    this.pendingNames.add(player.name);

    this.task = this.task.then(async () => {
      try {
        const profile = await this.getProfileFromWebApi(player);
        if (profile !== null) {
          if(this.checkAndBanPlayer(profile)) return;
          player.id = profile.id;
          player.profile = profile;
          this.logger.info(`Fetched player profile: ${player.name}`);
        } else {
          this.logger.warn(`Player cannot be found: ${player.name}`);
        }
        this.pendingNames.delete(player.name);
      } catch (e: any) {
        this.logger.error(`@ProfileFetcher#addTaskQueueIfNeeded\n${e.message}\n${e.stack}`);
      }
    });

    return true;
  }

  private checkAndBanPlayer(profile: UserProfile): boolean {
    if(this.option.allow_players_pp[1]){
      if (profile.statistics.pp < this.option.allow_players_pp[0]) {
        this.lobby.SendMessage(`!mp ban ${escapeUserName(profile.username)}`);
        this.lobby.SendPrivateMessage(this.option.under_range_msg, escapeUserName(profile.username));
        return true;
      }
      else if(profile.statistics.pp > this.option.allow_players_pp[1]){
        this.lobby.SendMessage(`!mp ban ${escapeUserName(profile.username)}`);
        this.lobby.SendPrivateMessage(this.option.over_range_msg, escapeUserName(profile.username));
        return true;
      }
    }
    return false;
  }

  private getProfileFromWebApi(player: Player): Promise<UserProfile | null> {
    return WebApiClient.getUser(player.name);
  }

  private isExpiredProfile(profile: UserProfile): boolean {
    return Date.now() < this.option.profile_expired_day * 24 * 60 * 60 * 1000 + profile.get_time;
  }
}

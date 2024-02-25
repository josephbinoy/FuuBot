import { Lobby } from '../Lobby';
import { LobbyPlugin } from './LobbyPlugin';
import { WebApiClient } from '../webapi/WebApiClient';
import { Event, History, Game, PromptScore } from '../webapi/HistoryTypes';


export class HistoryLoader extends LobbyPlugin {
  // task: Promise<void>;
  history: History | null = null;
  latest_event: Event | null = null;
  leaderboard: PromptScore[] = [];

  constructor(lobby: Lobby) {
    super(lobby, 'HistoryLoader', 'history');
    // this.task = this.initializeAsync();
    this.registerEvents();
  }

  // // private async initializeAsync(): Promise<void> {
  // //   await WebApiClient.updateToken();
  // // }

  private registerEvents(): void {
    this.lobby.MatchFinished.on(() => this.onMatchFinished());
  }

  async onMatchFinished() {
    const lobbyId = this.lobby.lobbyId ?? '0';
    this.history = await WebApiClient.getHistory(parseInt(lobbyId));
    const latest_event= this.getLatestGameEvent(this.history);

    if(latest_event != null && latest_event != this.latest_event){
      this.latest_event = latest_event;
      this.checkLobbyName(latest_event);
      const latest_game = latest_event?.game;
      this.createLeaderboard(latest_game);
    }

  }

  createLeaderboard(game: Game | undefined) {
    if (game == undefined) return;
    for (const score of game.scores) {
      if (score.passed == false) continue;
      let name = [...this.lobby.players].find(p => p.id == score.user_id)?.name;
      if (name == undefined) {
        name = this.searchUsers(score.user_id);
      }
      const pscore: PromptScore = {
        name: name? name : 'unknown',
        score: score.score,
        combo: score.max_combo,
        accuracy: score.accuracy
      }
      this.leaderboard.push(pscore);
    }
    if (this.leaderboard.length > 0) {
      const sortedLeaderboard = this.leaderboard.sort((a, b) => b.score - a.score);
      this.lobby.SendMessage("Winner is "+sortedLeaderboard[0].name)
      this.leaderboard = [];
    }
  }

  searchUsers(id: Number): string | undefined{
    const user = this.history?.users.find(u => u.id == id);
    if (user != undefined) {
      return user.username;
    }
    return undefined;
  }

  getLatestGameEvent(history: History): Event | null {
    let i = history.events.length-1;
    if (history.current_game_id==null){
      while(i>=0){
        if (history.events[i].game != undefined && history.events[i].game?.end_time != null)
          return history.events[i];
          i--;
      }
    }
    return null;
  }

  checkLobbyName(ev: Event) {
    if (ev.detail.text && ev.detail.text !== this.lobby.lobbyName) {
      const newName = ev.detail.text;
      const oldName = this.lobby.lobbyName;
      this.logger.info(`Lobby name has been changed: ${oldName} -> ${newName}, Host: ${this.lobby.host?.name}. Resetting...`);
      this.lobby.SendMessage(`!mp name ${oldName}`);
      this.lobby.lobbyName = newName;
    }
  }
}

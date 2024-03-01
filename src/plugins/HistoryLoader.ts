import { Lobby } from '../Lobby';
import { LobbyPlugin } from './LobbyPlugin';
import { WebApiClient } from '../webapi/WebApiClient';
import { Event, History, Game, PromptScore } from '../webapi/HistoryTypes';
import { getSummary } from '../ai/ScoreSummariser';

export class HistoryLoader extends LobbyPlugin {
  task: Promise<void>;
  history: History | null = null;
  latest_event: Event | null = null;
  leaderboard: PromptScore[] = [];
  best_acc: number = 0;
  best_accers: string[] = [];

  constructor(lobby: Lobby) {
    super(lobby, 'HistoryLoader', 'history');
    this.task = this.initializeAsync();
    this.registerEvents();
  }

  private async initializeAsync(): Promise<void> {
    await WebApiClient.updateToken();
  }

  private registerEvents(): void {
    this.lobby.MatchFinished.on(() => this.onMatchFinished());
  }

  private onMatchFinished() {
    const lobbyId = this.lobby.lobbyId ?? '0';
    let latest_event: Event | null = null;
    this.task = this.task.then(async () => {
      try{
        this.history = await WebApiClient.getHistory(parseInt(lobbyId));
        latest_event= this.getLatestGameEvent(this.history);
        if(latest_event != null && latest_event != this.latest_event){
          this.latest_event = latest_event;
          this.checkAndResetLobbyName(latest_event);
          const latest_game = latest_event?.game;
          this.createLeaderboardAndAccers(latest_game);
          if (this.leaderboard.length > 1) {
            const sortedLeaderboard = this.leaderboard.sort((a, b) => b.score - a.score);
            const summary = await getSummary(this.lobby.maxCombo, JSON.stringify(sortedLeaderboard), this.best_accers, this.best_acc);
            this.lobby.SendMessage(summary);
            this.leaderboard = [];
            this.best_acc = 0;
            this.best_accers = [];
          }
        }
      } 
      catch (e: any) {
        this.logger.error(`@HistoryLoader#onMatchFinished\n${e.message}\n${e.stack}`);
      }
    });
  }

  createLeaderboardAndAccers(game: Game | undefined) {
    if (game == undefined) return;
    for (const score of game.scores) {
      if (score.passed == false) continue;
      let name = [...this.lobby.players].find(p => p.id == score.user_id)?.name;
      if (name == undefined) {
        name = this.searchUsers(score.user_id) ?? 'unknown';
      }
      const pscore: PromptScore = {
        name: name,
        score: score.score,
        combo: parseFloat((score.max_combo * 100).toFixed(2))
      }
      this.leaderboard.push(pscore);
      if (score.accuracy > this.best_acc) {
        this.best_acc = score.accuracy;
        this.best_accers = [name];
      } else if (score.accuracy == this.best_acc) {
        this.best_accers.push(name);
      }
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

  checkAndResetLobbyName(ev: Event) {
    if (ev.detail.text && ev.detail.text !== this.lobby.lobbyName) {
      const newName = ev.detail.text;
      const oldName = this.lobby.lobbyName;
      this.logger.info(`Lobby name has been changed: ${oldName} -> ${newName}, Host: ${this.lobby.host?.name}. Resetting...`);
      this.lobby.SendMessage(`!mp name ${oldName}`);
      this.lobby.lobbyName = newName;
    }
  }
}

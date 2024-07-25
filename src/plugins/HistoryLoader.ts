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
  fcers: string[] = [];
  no_missers: string[] = [];
  modsUsed: boolean = false;
  previousSummary: string='';
  streak: number = 0;
  previousWinner: string = '';

  constructor(lobby: Lobby) {
    super(lobby, 'HistoryLoader', 'history');
    this.task = this.initializeAsync();
    this.registerEvents();
  }

  private async initializeAsync(): Promise<void> {
    try{
      await WebApiClient.updateToken();
    }
    catch (e: any) {
      this.logger.error(`@HistoryLoader#initializeAsync\n${e.message}\n${e.stack}`);
    }
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
          const latest_game = latest_event?.game;
          this.analyzeAndCreatePerfMetrics(latest_game);
          if (this.leaderboard.length > 1) {
            const sortedLeaderboard = this.leaderboard.sort((a, b) => b.score - a.score);
            if(sortedLeaderboard[0].name===this.previousWinner){
              this.streak++;
            }
            else{
              this.streak=1;
              this.previousWinner=sortedLeaderboard[0].name;
            }
            const summary = await getSummary(this.fcers, JSON.stringify(sortedLeaderboard), this.best_accers, this.best_acc, this.no_missers, sortedLeaderboard[0].name, this.modsUsed, this.previousSummary, this.streak);
            this.lobby.SendMessage(summary);
            this.previousSummary=summary;
          }
          else if(this.leaderboard.length == 1){
            this.previousSummary='';
            if(this.leaderboard[0].name == this.previousWinner)
              this.streak++;
            else
              this.streak=0;
          }
          else{
            this.streak=0;
            this.previousWinner='';
            this.previousSummary='';
          }
          this.leaderboard = [];
          this.best_acc = 0;
          this.best_accers = [];
          this.fcers = [];
          this.no_missers = [];
          this.modsUsed = false;
        }
      } 
      catch (e: any) {
        this.logger.error(`@HistoryLoader#onMatchFinished\n${e.message}\n${e.stack}`);
      }
    });
  }

  analyzeAndCreatePerfMetrics(game: Game | undefined) {
    if (game == undefined) return;
    for (const score of game.scores) {
      if (score.passed == false) continue;
      if (score.mods.length > 0) {
        this.modsUsed = true;
      }
      score.accuracy = parseFloat((score.accuracy * 100).toFixed(2))
      let name = [...this.lobby.players].find(p => p.id == score.user_id)?.name;
      if (name == undefined) {
        name = this.searchUsers(score.user_id) ?? 'unknown';
      }
      const pscore: PromptScore = {
        name: `${name}${score.mods.length > 0 ? ` using ${score.mods.join('')} mod` : ''}`,
        score: score.score
      }
      this.leaderboard.push(pscore);
      if (score.statistics.count_miss == 0)
        if(this.lobby.maxCombo - score.max_combo < 15)
          this.fcers.push(name)
        else
          this.no_missers.push(name)
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
}

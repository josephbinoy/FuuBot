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
  one_missers: string[] = [];
  almost_fcers: string[] = [];
  previousSummary: string='';
  streak: number = 0;
  avg_acc: number = 0;
  avg_combo_percent: number = 0;
  fail_count_percent: number = 0;
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
            const summary = await getSummary(
              this.fcers, 
              sortedLeaderboard, 
              this.best_accers, 
              this.best_acc,
              this.avg_acc,
              this.avg_combo_percent,
              this.fail_count_percent,
              this.no_missers, 
              sortedLeaderboard[0].name, 
              this.previousSummary, 
              this.streak,
              this.one_missers,
              this.almost_fcers
            );
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
          this.avg_acc = 0;
          this.avg_combo_percent = 0;
          this.fail_count_percent = 0;
          this.best_accers = [];
          this.fcers = [];
          this.no_missers = [];
          this.one_missers = [];
          this.almost_fcers = [];
        }
      } 
      catch (e: any) {
        this.logger.error(`@HistoryLoader#onMatchFinished\n${e.message}\n${e.stack}`);
      }
    });
  }

  analyzeAndCreatePerfMetrics(game: Game | undefined) {
    if (game == undefined) return;
    const fcThreshold = this.lobby.maxCombo*0.9;
    let passedCount = 0;
    let legitCount = 0;
    for (const score of game.scores) {
      score.accuracy = parseFloat((score.accuracy * 100).toFixed(2))
      if(score.accuracy >= 50 ) {
        this.avg_acc += score.accuracy;
        this.avg_combo_percent += score.max_combo;
        legitCount++;
      }
      if (score.passed == false) continue;
      passedCount++;
      let name = [...this.lobby.players].find(p => p.id == score.user_id)?.name;
      if (name == undefined) {
        name = this.searchUsers(score.user_id) ?? 'unknown';
      }
      const pscore: PromptScore = {
        name: name,
        score: score.score,
        mods: score.mods,
      }
      this.leaderboard.push(pscore);
      if (score.statistics.count_miss == 0){
        if(this.lobby.maxCombo - score.max_combo < 15)
          this.fcers.push(name)
        else
          this.no_missers.push(name)
      }
      else if (score.statistics.count_miss == 1){
        this.one_missers.push(name);
        if(score.max_combo >= fcThreshold)
          this.almost_fcers.push(name);
      }
      else if(score.max_combo >= fcThreshold){
        this.almost_fcers.push(name); 
      }
      if (score.accuracy > this.best_acc) {
        this.best_acc = score.accuracy;
        this.best_accers = [name];
      } else if (score.accuracy == this.best_acc) {
        this.best_accers.push(name);
      }
    }
    this.fail_count_percent = parseFloat(((game.scores.length-passedCount)/game.scores.length * 100).toFixed(2));
    this.avg_acc = parseFloat((this.avg_acc / legitCount).toFixed(2));
    this.avg_combo_percent = parseFloat((this.avg_combo_percent / legitCount).toFixed(2));
    this.avg_combo_percent = parseFloat((this.avg_combo_percent / this.lobby.maxCombo * 100).toFixed(2));
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

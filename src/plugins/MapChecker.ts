import { LobbyPlugin } from './LobbyPlugin';
import { Lobby } from '../Lobby';
import { Player } from '../Player';
import { validateOption } from '../libs/OptionValidator';
import { PlayMode } from '../Modes';
import { BanchoResponseType } from '../parsers/CommandParser';
import { BeatmapRepository, FetchBeatmapError, FetchBeatmapErrorReason, BeatmapCache } from '../webapi/BeatmapRepository';
import { Beatmap, Beatmapset } from '../webapi/Beatmapsets';
import { getConfig } from '../TypedConfig';
import { Logger } from '../Loggers';
import { WebApiClient } from '../webapi/WebApiClient';
import { PickEntry, getAllCounts, insertPicks, deleteOldPicks, hasPlayerPickedMap, getMapStats, timeAgo, notifyFuuBotWebServer, getLimits, MapCount} from '../db/helpers';
import * as modCalc from '../helpers/modCalculator'
import fs from 'fs';

export type MapCheckerOption = {
  enabled: boolean;
  dynamic_overplayed_map_checker:{
    enabled: boolean,
    pick_count_weekly_limit: number,
    pick_count_monthly_limit: number,
    pick_count_yearly_limit: number,
    pick_count_alltime_limit: number,
    picks_delete_time_period: string
  },
  advanced_filters: {
      enabled: boolean,
      od: [number, number],
      ar: [number, number],
      bpm: [number, number],
      cs: [number, number],
      play_count_yearly_average: [number, number],
      stamina_formula_c_value: number,
      year: [number, number],
      languages: string[],
      genres: string[],
      statuses: string[],
      tags: {
        genre_tags: string[],
        allow: string[],
        deny: string[]
      }
      artists: {
        allow: string[],
        deny: string[]
      }
      mappers: {
        allow: string[],
        deny: string[]
      }
      allow_nsfw: boolean
  };
  num_violations_allowed: number;
  star_min: number;
  star_max: number;
  length_min: number;
  length_max: number;
  gamemode: PlayMode;
  allow_convert: boolean;
  blacklisted_mapset_id_path: string,
  blacklisted_mapset_names_path: string,
  map_description: string;
};

export type MapCheckerUncheckedOption =
  { [key in keyof MapCheckerOption]?: any } & { num_violations_to_skip?: any, allowConvert?: any };

export interface FixedAttributes {
  bpm: number;
  od: number;
  ar: number;
  cs: number;
  hp: number;
  length: number;
  hit_length: number
}

export class OperationQueue {
  private queue: Promise<any> = Promise.resolve();

  addToQueue<T>(operation: () => Promise<T>): Promise<T> {
    this.queue = this.queue.then(operation, operation);
    return this.queue;
  }
}

export class MapChecker extends LobbyPlugin {
  option: MapCheckerOption;
  rejectedMap: BeatmapCache | undefined;
  playingMap: BeatmapCache | undefined;
  lastPlayedMap: BeatmapCache | undefined;
  oldMapId: number = 0;
  lastMapId: number = 0;
  checkingMapId: number = 0;
  numViolations: number = 0;
  validator: MapValidator;
  override: boolean = false;
  maxOverrides: number = 5;
  defaultIds: number[]=[];
  defaultIndex: number = -1;
  activeMods: string=''
  picksBuffer: Map<string, PickEntry> = new Map<string, PickEntry>();
  operationQueue: OperationQueue = new OperationQueue();
  weeklyCount: number = 0;
  monthlyCount: number = 0;
  yearlyCount: number = 0;
  alltimeCount: number = 0;
  weeklyLimit: number = 999;
  monthlyLimit: number = 999;
  yearlyLimit: number = 999;
  alltimeLimit: number = 999;
  lastInvokedListCommand: number = 0;
  bufferCount:Map<number, Set<number>> = new Map<number, Set<number>>();
  modAcronym: Record<string, string>= {
    'Easy': 'EZ',
    'NoFail': 'NF',
    'HalfTime': 'HT',
    'HardRock': 'HR',
    'SuddenDeath': 'SD',
    'Perfect': 'PF',
    'DoubleTime': 'DT',
    'Nightcore': 'NC',
    'Hidden': 'HD',
    'Flashlight': 'FL',
    'Relax': 'RL',
    'Autopilot': 'AP',
    'Spun Out': 'SO',
  };
  diffAffectingMods = ['Easy', 'HalfTime', 'HardRock', 'DoubleTime', 'Nightcore', 'Flashlight'];
  websiteLinks ={
    alltime: '',
    yearly: '',
    monthly: '',
    weekly: '',
    history: (id: number) => ''
  }

  constructor(lobby: Lobby, option: Partial<MapCheckerUncheckedOption> = {}) {
    super(lobby, 'MapChecker', 'mapChecker');
    const d = getConfig(this.pluginName, option) as MapCheckerUncheckedOption;
    validateMapCheckerOption(d);
    this.option = d as MapCheckerOption;

    if (this.option.gamemode instanceof PlayMode) {
      this.lobby.gameMode = this.option.gamemode;
    }
    this.validator = new MapValidator(this.option, this.logger, this.lobby);
    this.defaultIds = this.validator.LoadFilters('./maplists/default_map_ids.txt').map(Number).filter(id => !isNaN(id));
    this.initialize();
    this.registerEvents();
    if(process.env.HOST_NAME==='greatmcgamer'){
      this.websiteLinks = {
        alltime: '[https://fuubot.mineapple.net?preset=alltime Check overplayed list]',
        yearly: '[https://fuubot.mineapple.net?preset=yearly Check yearly list]',
        monthly: '[https://fuubot.mineapple.net?preset=monthly Check monthly list]',
        weekly: '[https://fuubot.mineapple.net Check weekly list]',
        history: (id: number) => `[https://fuubot.mineapple.net/history/${id} Check History]`,
      };
    }
  }

  private async initialize() {
    this.weeklyLimit = this.option.dynamic_overplayed_map_checker.pick_count_weekly_limit;
    this.monthlyLimit = this.option.dynamic_overplayed_map_checker.pick_count_monthly_limit;
    this.yearlyLimit = this.option.dynamic_overplayed_map_checker.pick_count_yearly_limit;
    this.alltimeLimit = this.option.dynamic_overplayed_map_checker.pick_count_alltime_limit;
    const limits: MapCount = await getLimits();
    if (limits.weeklyCount!==999){
      this.weeklyLimit = limits.weeklyCount;
      this.logger.info(`Weekly limit set to ${this.weeklyLimit}`);
    }
    if (limits.monthlyCount!==999){
      this.monthlyLimit = limits.monthlyCount;
      this.logger.info(`Monthly limit set to ${this.monthlyLimit}`);
    }
    if (limits.yearlyCount!==999){
      this.yearlyLimit = limits.yearlyCount;
      this.logger.info(`Yearly limit set to ${this.yearlyLimit}`);
    }
    if (limits.alltimeCount!==999){
      this.alltimeLimit = limits.alltimeCount;
      this.logger.info(`All time limit set to ${this.alltimeLimit}`);
    }
  }

  private addPickAndUpdateCount(pick: PickEntry, hasPicked:boolean): void {
    this.operationQueue.addToQueue(async () => {
      //picksBuffer
      const pickKey = `${pick.beatmapId}-${pick.pickerId}`;
      if (this.picksBuffer.has(pickKey)) {
        this.picksBuffer.get(pickKey)!.pickDate = pick.pickDate;
      } else {
        this.picksBuffer.set(pickKey, pick);
      }
      if(hasPicked) return;
      //bufferCount
      if (this.bufferCount.has(pick.beatmapId)) {
        this.bufferCount.get(pick.beatmapId)!.add(pick.pickerId);
      } else {
        this.bufferCount.set(pick.beatmapId, new Set([pick.pickerId]));
      }
    });
  }

  private async checkBufferForMap(beatmapId: number, pickerId: number): Promise<PickEntry | null>{
    return this.operationQueue.addToQueue(async () => {
      let mostRecentPick: PickEntry | null = null;
      for (const entry of this.picksBuffer.values()) {
          if (entry.beatmapId === beatmapId &&  entry.pickerId !== pickerId) {
              if (!mostRecentPick || entry.pickDate > mostRecentPick.pickDate) {
                  mostRecentPick = entry;
              }
          }
      }
      return mostRecentPick;
    });
  }

  private queueInsert(): void {
    this.operationQueue.addToQueue(async () => {
      try {
          if(this.lobby.dbClient){
            this.logger.info('Inserting to database');
            await insertPicks(this.lobby.dbClient, this.picksBuffer);
            const picks = Array.from(this.picksBuffer.values())
            notifyFuuBotWebServer(picks);
            this.picksBuffer.clear();
            this.bufferCount.clear();
            this.lobby.lastDbUpdateTime = Date.now();
          }
      } catch (error) {
          this.logger.error('@MapChecker#databaseInsert'+error);
      }
    });
  }

  private updateDatabase(): void {
    this.operationQueue.addToQueue(async () => {
      try {
          if(this.lobby.dbClient){
            this.logger.info('Inserting to database');
            await insertPicks(this.lobby.dbClient, this.picksBuffer);
            const picks = Array.from(this.picksBuffer.values())
            notifyFuuBotWebServer(picks);
            this.picksBuffer.clear();
            this.bufferCount.clear();
            this.lobby.lastDbUpdateTime = Date.now();
            if(this.option.dynamic_overplayed_map_checker.picks_delete_time_period!==""){
              this.logger.info('Deleting old picks');
              await deleteOldPicks(this.lobby.dbClient, this.option.dynamic_overplayed_map_checker.picks_delete_time_period);
            }
          }
      } catch (error) {
          this.logger.error('@MapChecker#databaseOperations'+error);
      }
    });
  }

  private onPlayerLeft(): void {
    if(this.lobby.players.size === 0){
      this.override = false;
      this.enforceDefaultMap();
      if(this.option.dynamic_overplayed_map_checker.enabled && this.picksBuffer.size>5){
        this.updateDatabase();
      }
    }
  }

  private registerEvents(): void {
    this.lobby.JoinedLobby.once(a => this.onJoinedLobby());
    this.lobby.ReceivedChatCommand.on(a => this.onReceivedChatCommand(a.command, a.param, a.player));
    this.lobby.ReceivedBanchoResponse.on(a => {
      switch (a.response.type) {
        case BanchoResponseType.BeatmapChanged:
          this.onBeatmapChanged(a.response.params[0], a.response.params[1]);
          break;
        case BanchoResponseType.HostChanged:
          this.cancelCheck();
          break;
        case BanchoResponseType.BeatmapChanging:
          this.checkingMapId = 0;
          break;
        case BanchoResponseType.MatchStarted:
          this.onMatchStarted();
          break;
        case BanchoResponseType.AbortedMatch:
          if(this.option.enabled){
            this.lobby.isValidMap = true;
            this.lobby.rejectedWrongLang = false;
          }
          break;
        case BanchoResponseType.MatchFinished:
          if(this.option.enabled){
            this.lobby.isValidMap = false;
            this.lobby.rejectedWrongLang = false;
          }
          break;
      }
    });
    this.lobby.PlayerLeft.on(a => this.onPlayerLeft());
  }

  private onJoinedLobby(): void {
    if (this.option.enabled) {
      this.SendPluginMessage('enabledMapChecker');
    }
    this.enforceDefaultMap();
  }

  private async onMatchStarted() {
    this.oldMapId=this.lobby.mapId;
    if (this.option.enabled) {
      if (!this.lobby.isValidMap){
        this.lobby.SendMessage(`!mp abort\nThe match was aborted because map didn't get validated or previous map was repicked! Please change the map`)
      }
      else if (this.lobby.SendMessageWithCoolTime('!mp settings', 'modcheck', 5000)) {
        try {
          await new Promise<void>((resolve,reject) => {
            //get mods
            this.lobby.ParsedSettings.once(a => {
              this.activeMods = a.result.activeMods.replace(/, Freemod|Freemod, |^Freemod$/, '');
              resolve();
            });

            setTimeout(() => {
              reject();
            }, 5000);
          });
        } catch{
          this.logger.info(`Failed to get mods. The match will start without checking mods`);
        }
        finally {
          this.checkForMods();
        }
      }
    }
    this.cancelCheck();
    this.lobby.mapStartTimeMs = Date.now()
  }

  private getFixedAttributes(map: Beatmap | BeatmapCache | undefined, modList: string[]): FixedAttributes{
    let new_ar=map?.ar || 0
    let new_od=map?.accuracy || 0
    let new_cs=map?.cs || 0
    let new_bpm=map?.bpm || 0
    let new_hp=map?.drain || 0
    let new_length=map?.total_length || 0
    let new_hit_length=map?.hit_length || 0

    //calculate for HR or EZ
    if(modList.includes('HR')){
      ({cs: new_cs, ar: new_ar, od: new_od,hp: new_hp} = modCalc.toHR(new_cs, new_ar, new_od, new_hp));
    }
    else if(modList.includes('EZ')){
      ({cs: new_cs, ar: new_ar, od: new_od,hp: new_hp} = modCalc.toEZ(new_cs, new_ar, new_od, new_hp));
    }
    //calculate for DT or HT
    if(modList.includes('DT') || modList.includes('NC')){
      new_ar= modCalc.DoubleTimeAR(new_ar);
      new_od= modCalc.odDT(new_od);
      new_bpm=new_bpm*1.5;
      new_length=new_length/1.5;
      new_hit_length=new_hit_length/1.5;
    }
    else if(modList.includes('HT')){
      new_ar= modCalc.HalfTimeAR(new_ar);
      new_od = modCalc.odHT(new_od);
      new_bpm=new_bpm*0.75;
      new_length=new_length/0.75;
      new_hit_length=new_hit_length/0.75;
    }

    let attr: FixedAttributes = {
      bpm: new_bpm,
      od: new_od,
      ar: new_ar,
      cs: new_cs,
      hp: new_hp,
      length: new_length,
      hit_length: new_hit_length
    };
    return attr;
  }
 
  private async checkForMods() {
    try {
      let result=""
      let starRating = this.playingMap?.difficulty_rating || 0;
      let attributes: FixedAttributes={
        bpm: this.playingMap?.bpm || 0,
        od: this.playingMap?.accuracy || 0,
        ar: this.playingMap?.ar || 0,
        cs: this.playingMap?.cs || 0,
        hp: this.playingMap?.drain || 0,
        length: this.playingMap?.total_length || 0,
        hit_length: this.playingMap?.hit_length || 0
      }
        if (this.activeMods != '' && this.diffAffectingMods.some(mod => this.activeMods.includes(mod))) {
          let modList = this.activeMods.split(', ').map(mod => this.modAcronym[mod]);
          attributes = this.getFixedAttributes(this.playingMap, modList);
          starRating = await WebApiClient.getDifficultyRating(this.lobby.mapId, modList);
          this.activeMods = '';
        }
        if (this.option.star_min > 0 && starRating < this.option.star_min) {
          this.lobby.SendMessage(`!mp abort\n!mp mods Freemod\nMatch was aborted because host tried to pick a map below regulation. (${starRating}* < ${this.option.star_min}*)`);
          return;
        }
        else if (this.option.star_max > 0 && this.option.star_max < starRating) {
          this.lobby.SendMessage(`!mp abort\n!mp mods Freemod\nMatch was aborted because host tried to pick a map above regulation. (${starRating}* > ${this.option.star_min}*)`);
          return;
        }
        if (this.option.length_min > 0 && attributes.length < this.option.length_min) {
          this.lobby.SendMessage(`!mp abort\n!mp mods Freemod\nMatch was aborted because map is shorter than allowed length (${secToTimeNotation(attributes.length)} < ${secToTimeNotation(this.option.length_min)})`);
          return;
        }
        else if (this.option.length_max > 0 && this.option.length_max < attributes.length) {
          this.lobby.SendMessage(`!mp abort\n!mp mods Freemod\nMatch was aborted because map is longer than allowed length (${secToTimeNotation(attributes.length)} > ${secToTimeNotation(this.option.length_max)})`);
          return;
        }
        if(this.option.advanced_filters.enabled && (result = this.validator.fixedFiltering(attributes)) !== ""){
          this.lobby.SendMessage(`!mp abort\n!mp mods Freemod\nMatch was aborted because ${result}`);
          return;
        }
        this.lobby.mapAttributes = attributes;
        const now = Date.now();
        if (this.option.dynamic_overplayed_map_checker.enabled && this.picksBuffer.size>5 && now - this.lobby.lastDbUpdateTime > 3600000 && attributes.length > 120){
          this.queueInsert();
        }
      }
    catch (e: any) {
      this.logger.info(`@MapChecker#checkForMods${e.message}`);
    }
  }

  private async onBeatmapChanged(mapId: number, mapTitle: string) {
    if (this.option.enabled) {
      this.lobby.isValidMap = false;
      this.checkingMapId = mapId;
      if (this.lobby.SendMessageWithCoolTime('!mp settings', 'modcheck', 5000)) {
        try {
          await new Promise<void>((resolve,reject) => {
            //get mods
            this.lobby.ParsedSettings.once(a => {
              this.activeMods = a.result.activeMods.replace(/, Freemod|Freemod, |^Freemod$/, '');
              resolve();
            });

            setTimeout(() => {
              reject();
            }, 5000);
          });
        } 
        catch (e:any) {
          this.logger.info(`Failed to get mods. The beatmap will be checked without mods.`);
        }
        finally {
          this.check(mapId, mapTitle);
        }
      } else {
        this.check(mapId, mapTitle);
      }
    }
  }

  private async onReceivedChatCommand(command: string, param: string, player: Player) {
    if (command === '!r' || command === '!regulation') {
      this.lobby.SendMessageWithCoolTime(this.getRegulationDescription(), 'regulation', 10000);
      return;
    }
    else if(command === '!force' && player.isHost) {
      if(player.overrides < this.maxOverrides){
        player.overrides++;
        if(this.lobby.rejectedWrongLang){
          this.lobby.SendMessage('Forcing previous map...');
          let attri: FixedAttributes={
            bpm: this.rejectedMap?.bpm || 0,
            od: this.rejectedMap?.accuracy || 0,
            ar: this.rejectedMap?.ar || 0,
            cs: this.rejectedMap?.cs || 0,
            hp: this.rejectedMap?.drain || 0,
            length: this.rejectedMap?.total_length || 0,
            hit_length: this.rejectedMap?.hit_length || 0
          }
          this.forceMap(attri);
          this.lobby.rejectedWrongLang = false;
        }
        else{
          this.override = true;
          this.lobby.SendMessage('Go ahead and pick your map! Type !info for help.');
        }
      }
      else
        this.lobby.SendMessage(`Sorry! You have forced too many maps this session. (Maximum ${this.maxOverrides})`);
      return;
    }
    else if(command === '!timeleft' && this.lobby.isMatching){
      const timeLeft = Math.floor(((this.lobby.mapStartTimeMs+this.lobby.mapLength*1000)-Date.now())/1000);
      if(timeLeft<0){
        this.lobby.SendMessage('The match will end in a few seconds...');
        return;
      }
      const min = Math.floor(timeLeft/60);
      const sec = timeLeft%60;
      this.lobby.SendMessage(`Approx. time left to finish current match: ${min}m ${sec}s`);
    }
    else if(command === '!ms' && !this.lobby.isMatching){
      let statMsg;
      if (this.option.dynamic_overplayed_map_checker.enabled && this.lobby.dbClient && this.playingMap){
        const bufferRecentPick = await this.checkBufferForMap(this.playingMap.beatmapset_id, this.lobby.host?.id || 0);
        if(bufferRecentPick){
          let name = "";
          const user = await WebApiClient.getUser(bufferRecentPick.pickerId);
          if (user)
              name = user.username;
          else
              name = "anonymous";
          const pickDate = new Date(bufferRecentPick.pickDate * 1000);
          statMsg = `Previously picked by [https://osu.ppy.sh/users/${bufferRecentPick.pickerId} ${name}] ${timeAgo(pickDate.toISOString())}`; 
        }
        else {
          statMsg = await getMapStats(this.lobby.dbClient, this.playingMap.beatmapset_id);
        }
        if(statMsg){
          this.lobby.SendMessage(`[https://osu.ppy.sh/b/${this.playingMap.id} ${this.playingMap.beatmapset?.title}] has been picked by ${this.weeklyCount} player${this.weeklyCount == 1 ? '' : 's'} past week and ${this.alltimeCount} all time (${statMsg})`);
        }
        else if(statMsg === null){
          this.lobby.SendMessage(`[https://osu.ppy.sh/b/${this.playingMap.id} ${this.playingMap.beatmapset?.title}] has never been picked before`);
        }
        else{
          this.logger.error(`Database Error while trying to get map stats`);
        }
      }
    }
    if (player.isAuthorized) {
      if (command === '*add'){
        const currentTime = Date.now();
        const params = param.split(/\s+/).map(s => s.toLowerCase()).filter(s => s !== '');
        if(params[0] === 'black'){
          if (currentTime - this.lastInvokedListCommand < 10000) {
            this.lobby.SendPrivateMessageWithCoolTime(`The add command is on cooldown. Please wait ${Math.ceil((10000 - (currentTime - this.lastInvokedListCommand)) / 1000)} seconds`, player.escaped_name, 'add_warning', 5000);
            return;
          }
          this.lastInvokedListCommand = currentTime;
          this.addToBlacklist(player.escaped_name);
        }
        else if(params[0] === 'default'){
          if (currentTime - this.lastInvokedListCommand < 10000) {
            this.lobby.SendPrivateMessageWithCoolTime(`The add command is on cooldown. Please wait ${Math.ceil((10000 - (currentTime - this.lastInvokedListCommand)) / 1000)} seconds`, player.escaped_name, 'add_warning', 5000);
            return;
          }
          this.lastInvokedListCommand = currentTime;
          this.addToDefaultList(player.escaped_name);
        }
        return;
      }
      else if (command === '*remove'){
        const currentTime = Date.now();
        const params = param.split(/\s+/).map(s => s.toLowerCase()).filter(s => s !== '');
        if(params[0] === 'black'){
          if (currentTime - this.lastInvokedListCommand < 10000) {
            this.lobby.SendPrivateMessageWithCoolTime(`The remove command is on cooldown. Please wait ${Math.ceil((10000 - (currentTime - this.lastInvokedListCommand)) / 1000)} seconds`, player.escaped_name, 'remove_warning', 5000);
            return;
          }
          this.lastInvokedListCommand = currentTime;
          this.removeFromBlacklist(player.escaped_name);
        }
        else if(params[0] === 'default'){
          if (currentTime - this.lastInvokedListCommand < 10000) {
            this.lobby.SendPrivateMessageWithCoolTime(`The remove command is on cooldown. Please wait ${Math.ceil((10000 - (currentTime - this.lastInvokedListCommand)) / 1000)} seconds`, player.escaped_name, 'remove_warning', 5000);
            return;
          }
          this.lastInvokedListCommand = currentTime;
          this.removeFromDefaultList(player.escaped_name);
        }
        return;
      }
      this.processOwnerCommand(command, param);
    }
  }

  private addToBlacklist(ownerName: string) {
    const mapsetId = this.playingMap?.beatmapset_id || 0;
    if(mapsetId === 0) return;
    const mapsetName = this.playingMap?.beatmapset?.title || '';
    fs.appendFile(this.option.blacklisted_mapset_id_path, `\n${mapsetId}`, (err) => {
      if (err) {
        this.logger.error(`Failed to add [https://osu.ppy.sh/beatmapsets/${mapsetId} ${mapsetName}] to blacklist`, err);
      } else {
        this.validator.blacklistedIds.push(mapsetId);
        this.lobby.SendPrivateMessage(`[https://osu.ppy.sh/beatmapsets/${mapsetId} ${mapsetName}] has been added to blacklist`, ownerName);
      }
    });
  }

  private removeFromBlacklist(ownerName: string) {
    const mapsetId = this.validator.blackedMap?.beatmapset_id || 0;
    if(mapsetId === 0) return;
    const mapsetName = this.validator.blackedMap?.beatmapset?.title || '';
    const initialLength = this.validator.blacklistedIds.length;
    this.validator.blacklistedIds = this.validator.blacklistedIds.filter(blacklistedId => blacklistedId !== mapsetId);
    if(this.validator.blacklistedIds.length === initialLength) return;
    fs.writeFile(this.option.blacklisted_mapset_id_path, this.validator.blacklistedIds.join('\n'), (err) => {
      if (err) {
        this.logger.error(`Failed to remove [https://osu.ppy.sh/beatmapsets/${mapsetId} ${mapsetName}] from blacklist`, err);
      } else {
        this.lobby.SendPrivateMessage(`[https://osu.ppy.sh/beatmapsets/${mapsetId} ${mapsetName}] has been removed from blacklist`, ownerName);
      }
    });
  }

  private addToDefaultList(ownerName: string) {
    const mapId = this.playingMap?.id || 0;
    if(mapId === 0) return;
    let  mapName = this.playingMap?.beatmapset?.title || '';
    mapName += ` [${this.playingMap?.version || ''}]`;
    fs.appendFile('./maplists/default_map_ids.txt', `\n${mapId}`, (err) => {
      if (err) {
        this.logger.error(`Failed to add [https://osu.ppy.sh/b/${mapId} ${mapName}] to default list`, err);
      } else {
        this.defaultIds.push(mapId);
        this.lobby.SendPrivateMessage(`[https://osu.ppy.sh/b/${mapId} ${mapName}] has been added to default list.`, ownerName);
      }
    });
  }

  private removeFromDefaultList(ownerName: string) {
    const mapId = this.playingMap?.id || 0;
    if(mapId === 0) return;
    let mapName = this.playingMap?.beatmapset?.title || '';
    mapName += ` [${this.playingMap?.version || ''}]`;
    const initialLength = this.defaultIds.length;
    this.defaultIds = this.defaultIds.filter(defaultId => defaultId !== mapId);
    if(this.defaultIds.length === initialLength) return;
    fs.writeFile('./maplists/default_map_ids.txt', this.defaultIds.join('\n'), (err) => {
      if (err) {
        this.logger.error(`Failed to remove [https://osu.ppy.sh/b/${mapId} ${mapName}] from default list`, err);
      } else {
        this.lobby.SendPrivateMessage(`[https://osu.ppy.sh/b/${mapId} ${mapName}] has been removed from default list`, ownerName);
      }
    });
  }

  processOwnerCommand(command: string, param: string) {
    try {
      const p = parseMapcheckerOwnerCommand(command, param);
      if (p === undefined) return;

      if (p.enabled !== undefined) {
        this.SetEnabled(p.enabled);
      }
      if (p.num_violations_allowed !== undefined) {
        this.option.num_violations_allowed = p.num_violations_allowed;
        this.logger.info(`Number of allowed violations set to ${p.num_violations_allowed}`);
      }
      let changed = false;
      if (p.star_min !== undefined) {
        this.option.star_min = p.star_min;
        if (this.option.star_max <= this.option.star_min && this.option.star_max > 0) {
          this.option.star_max = 0;
        }
        changed = true;
      }
      if (p.star_max !== undefined) {
        this.option.star_max = p.star_max;
        if (this.option.star_max <= this.option.star_min && this.option.star_max > 0) {
          this.option.star_min = 0;
        }
        changed = true;
      }
      if (p.length_min !== undefined) {
        this.option.length_min = p.length_min;
        if (this.option.length_max <= this.option.length_min && this.option.length_max > 0) {
          this.option.length_max = 0;
        }
        changed = true;
      }
      if (p.length_max !== undefined) {
        this.option.length_max = p.length_max;
        if (this.option.length_max <= this.option.length_min && this.option.length_max > 0) {
          this.option.length_min = 0;
        }
        changed = true;
      }
      if (p.gamemode !== undefined) {
        this.option.gamemode = p.gamemode;
        this.lobby.gameMode = p.gamemode;
        changed = true;
      }
      if (p.allow_convert !== undefined) {
        this.option.allow_convert = p.allow_convert;
        changed = true;
      }

      if (changed) {
        const m = `New regulation: ${this.validator.GetDescription()}`;
        this.lobby.SendMessage(m);
        this.logger.info(m);
      }
    } catch (e: any) {
      this.logger.warn(`@MapChecker#processOwnerCommand\n${e.message}\n${e.stack}`);
    }
  }

  getRegulationDescription(): string {
    let desc=''
    if (this.option.enabled) {
      desc=this.validator.GetDescription();
      if(this.option.advanced_filters.enabled){
        desc+=`\n${this.validator.GetAdvancedFiltersDescription()}`;
      }
    } else {
      desc= `Disabled (${this.validator.GetDescription()})`;
    }
    return desc;
  }

  SetEnabled(v: boolean): void {
    if (v === this.option.enabled) return;

    if (v) {
      this.SendPluginMessage('enabledMapChecker');
      this.lobby.SendMessage('Map Checker plugin enabled.');
      this.logger.info('Map Checker plugin enabled.');
    } else {
      this.SendPluginMessage('disabledMapChecker');
      this.lobby.SendMessage('Map Checker plugin disabled.');
      this.logger.info('Map Checker plugin disabled.');
    }
    this.option.enabled = v;
  }

  private async cancelCheck() {
    this.checkingMapId = 0;
    this.numViolations = 0;
    this.override = false;
  }

  private async check(mapId: number, mapTitle: string): Promise<void> {
    if (mapId === this.oldMapId){
      this.numViolations--;
      this.rejectMap(`Please pick a new map!`, false);
      return;
    }
    try {
      const map = await BeatmapRepository.getBeatmap(mapId, this.option.gamemode, this.option.allow_convert);
      if (this.option.dynamic_overplayed_map_checker.enabled && this.lobby.dbClient){
        let { weeklyCount, monthlyCount, yearlyCount, alltimeCount } = await getAllCounts(this.lobby.dbClient, map.beatmapset_id);
        const curBufferCount = this.bufferCount.get(map.beatmapset_id)?.size || 0;
        this.weeklyCount = weeklyCount + curBufferCount;
        this.monthlyCount = monthlyCount + curBufferCount;
        this.yearlyCount = yearlyCount + curBufferCount;
        this.alltimeCount = alltimeCount + curBufferCount;
        if(this.alltimeCount >= this.alltimeLimit){
          this.rejectMap(`This beatmapset is overplayed! (Picked by ${this.alltimeCount} players. ${this.websiteLinks.alltime}). Please pick another map`, false)
          return;
        }
        if(this.weeklyCount >= this.weeklyLimit){
          this.rejectMap(`Weekly quota for this map has been reached! (Picked by ${this.weeklyCount} players past week. ${this.websiteLinks.weekly}). Please pick another map`, false)
          return;
        }
        if(this.monthlyCount >= this.monthlyLimit){
          this.rejectMap(`Monthly quota for this map has been reached! (Picked by ${this.monthlyCount} players past month. ${this.websiteLinks.monthly}). Please pick another map`, false)
          return;
        }
        if(this.yearlyCount >= this.yearlyLimit){
          this.rejectMap(`Yearly quota for this map has been reached! (Picked by ${this.yearlyCount} players past year. ${this.websiteLinks.yearly}). Please pick another map`, false)
          return;
        }
        const hasPicked = await hasPlayerPickedMap(this.lobby.dbClient, map.beatmapset_id, this.lobby.host?.id || 0);
        const pick={ 
          beatmapId: map.beatmapset_id,
          pickerId: this.lobby.host?.id || 0, 
          pickDate: Math.floor(new Date().getTime() / 1000)
        }
        this.addPickAndUpdateCount(pick, hasPicked);
      }
      this.lobby.maxCombo = map.max_combo;
      this.lobby.mapLength = map.total_length;
      if (mapId !== this.checkingMapId) {
        this.logger.info(`The target beatmap has already been changed. Checked beatmap: ${mapId}, Current: ${this.checkingMapId}`);
        return;
      }
      let newStarRating = 0;
      let attributes: FixedAttributes={
        bpm: map.bpm,
        od: map.accuracy,
        ar: map.ar,
        cs: map.cs,
        hp: map.drain,
        length: map.total_length,
        hit_length: map.hit_length
      }
      let modList: string[] = [];
      if (this.activeMods != '' && this.diffAffectingMods.some(mod => this.activeMods.includes(mod))) {
        modList = this.activeMods.split(', ').map(mod => this.modAcronym[mod]);
        attributes = this.getFixedAttributes(map, modList);
        newStarRating = await WebApiClient.getDifficultyRating(mapId, modList);
        this.activeMods = '';
      }
      const r = this.validator.RateBeatmap(map, this.override, newStarRating, attributes);
      if (r.rate > 0) {
        if(r.rate === 69){
          this.rejectMap(r.message, false);
          this.lobby.rejectedWrongLang = false;
        }
        else if(r.rate === 420){
          this.rejectMap(r.message, false);
          this.lobby.rejectedWrongLang = true;
          this.rejectedMap = map;
        }
        else
          this.rejectMap(r.message, true);
      } 
      else 
        this.acceptMap(map, attributes, newStarRating, modList);
      } 
      catch (e: any) {
      if (e instanceof FetchBeatmapError) {
        switch (e.reason) {
          case FetchBeatmapErrorReason.FormatError:
            this.logger.error(`Failed to parse the webpage. Checked beatmap: ${mapId}`);
            break;
          case FetchBeatmapErrorReason.NotFound:
            this.logger.info(`Beatmap cannot be found. Checked beatmap: ${mapId}`);
            this.rejectMap(`[https://osu.ppy.sh/b/${mapId} ${mapTitle}] has already been removed from the website.`, false);
            break;
          case FetchBeatmapErrorReason.PlayModeMismatched:
            this.logger.info(`Gamemode mismatched. Checked beatmap: ${mapId}`);
            this.rejectMap(`[https://osu.ppy.sh/b/${mapId} ${mapTitle}] is not an ${this.option.gamemode.officialName} beatmap. Please pick an ${this.option.gamemode.officialName} beatmap.`, false);
            break;
          case FetchBeatmapErrorReason.NotAvailable:
            this.logger.info(`Beatmap is not available. Checked beatmap: ${mapId}`);
            this.rejectMap(`[https://osu.ppy.sh/b/${mapId} ${mapTitle}] is not available for download.`, false);
            break;
        }
      } else {
        this.logger.error(`@MapChecker#check\nThere was an error while checking beatmap ${mapId}\n${e.message}\n${e.stack}`);
      }
    }
  }

  private skipHost(): void {
    if(this.lobby.host){
      const msg = `The number of violations has reached ${this.option.num_violations_allowed}. Skipping player ${this.lobby.host.escaped_name}`;
      this.logger.info(msg);
      this.lobby.SendMessage(msg);
      this.SendPluginMessage('skip');
    }
  }

  private rejectMap(reason: string, showRegulation: boolean): void {
    this.numViolations += 1;
    this.logger.info(`Rejected the beatmap selected by ${this.lobby.host?.escaped_name} (${this.numViolations} / ${this.option.num_violations_allowed})`);

    if (showRegulation) {
      this.lobby.SendMessage(`!mp map ${this.lastMapId} ${this.option.gamemode.value} | Current regulation: ${this.validator.GetDescription()}${this.option.advanced_filters.enabled?' | Type !r to get complete regulations':''}`);
      this.lobby.SendMessage(reason);
    } else {
      this.lobby.SendMessage(`!mp map ${this.lastMapId} ${this.option.gamemode.value} | ${reason}`);
    }
    this.playingMap = this.lastPlayedMap;
    if(this.lastMapId != this.oldMapId)
      this.lobby.isValidMap = true;

    if (this.option.num_violations_allowed !== 0 && this.option.num_violations_allowed <= this.numViolations) {
      this.skipHost();
    }
  }

  private async enforceDefaultMap(): Promise<void> {
    if(this.defaultIds.length === 0) return;
    this.defaultIndex = (this.defaultIndex + 1) % this.defaultIds.length;
    const mapId=this.defaultIds[this.defaultIndex];
    let map: BeatmapCache | undefined;
    try{
      map = await BeatmapRepository.getBeatmap(mapId, this.option.gamemode, this.option.allow_convert);
    } catch (e: any) {
      this.logger.error(`@MapChecker#enforceDefaultMap\n${e.message}\n${e.stack}`);
    }
    if(map){
      this.lobby.SendMessage(`!mp map ${mapId} ${this.option.gamemode.value}`);
      this.lobby.isValidMap = true;
      this.lastMapId = mapId;
      this.lastPlayedMap = map;
      this.playingMap = map;
      this.lobby.maxCombo = this.playingMap.max_combo;
      this.lobby.mapLength = this.playingMap.total_length;
      this.lobby.rejectedWrongLang = false;
    }
  }

  private forceMap(attributes: FixedAttributes): void {
    if(this.rejectedMap){
      if (this.rejectedMap.beatmapset) {
        const desc = this.getMapDescription(this.rejectedMap, this.rejectedMap.beatmapset, attributes, this.rejectedMap.difficulty_rating, []);
        this.lobby.SendMessage(`!mp map ${this.rejectedMap.id} ${this.option.gamemode.value} | ${desc}`);
      } else {
        this.lobby.SendMessage(`!mp map ${this.rejectedMap.id} ${this.option.gamemode.value}`);
      }
      this.SendPluginMessage('validatedMap');
      this.lobby.isValidMap = true;
      this.lastMapId = this.rejectedMap.id;
      this.lastPlayedMap = this.rejectedMap;
      this.playingMap = this.rejectedMap;
      this.lobby.maxCombo = this.rejectedMap.max_combo;
      this.lobby.mapLength = this.rejectedMap.total_length;
      this.lobby.rejectedWrongLang = false;
    }
    else{
      this.lobby.SendMessage('There was an error while trying to force the map. Please try again.');
    }
  }

  private acceptMap(map: BeatmapCache, attributes: FixedAttributes, sr: number, mods: string[]): void {
    if (map.beatmapset) {
      const desc = this.getMapDescription(map, map.beatmapset, attributes, sr, mods);
      this.lobby.SendMessage(`!mp map ${this.lobby.mapId} ${this.option.gamemode.value} | ${desc}`);
    } else {
      this.lobby.SendMessage(`!mp map ${this.lobby.mapId} ${this.option.gamemode.value}`);
    }
    this.SendPluginMessage('validatedMap');
    this.lobby.isValidMap = true;
    this.lastMapId = this.lobby.mapId;
    this.lastPlayedMap = map;
    this.playingMap = map;
    this.lobby.rejectedWrongLang = false;
  }

  private getMapDescription(map: BeatmapCache, set: Beatmapset, attributes: FixedAttributes, sr: number, mods: string[]) {
    let desc = this.option.map_description;
    const cps = (map.count_circles+map.count_sliders+map.count_spinners)/attributes.hit_length;
    const csr = map.count_sliders == 0 ? '∞' : (map.count_circles / map.count_sliders).toFixed(1);
    desc = desc.replace(/\$\{title\}/g, set.title);
    if(mods.length>0){
      if(mods.includes('DT') && mods.includes('NC')){
        const index = mods.indexOf('DT');
        mods.splice(index, 1);
      }
      desc = desc.replace(/\$\{mods\}/g, `+${mods.join('')}`);
    }
    else{
      desc = desc.replace(/\$\{mods\}/g, '');
    }
    desc = desc.replace(/\$\{map_id\}/g, map.id.toString());
    desc = desc.replace(/\$\{beatmapset_id\}/g, set.id.toString());
    desc = desc.replace(/\$\{star\}/g, sr===0?map.difficulty_rating.toFixed(2):sr.toFixed(2));
    desc = desc.replace(/\$\{length\}/g, secToTimeNotation(attributes.length));
    desc = desc.replace(/\$\{bpm\}/g, Number.isInteger(attributes.bpm) ? attributes.bpm.toString() : attributes.bpm.toFixed(1));
    desc = desc.replace(/\$\{ar\}/g, Number.isInteger(attributes.ar) ? attributes.ar.toString() : attributes.ar.toFixed(1));
    desc = desc.replace(/\$\{cs\}/g, Number.isInteger(attributes.cs) ? attributes.cs.toString() : attributes.cs.toFixed(1));
    desc = desc.replace(/\$\{stamina\}/g, cps.toFixed(2));
    desc = desc.replace(/\$\{csr\}/g, csr);
    desc = desc.replace(/\$\{play_count\}/g, `${this.weeklyCount.toString()} player${this.weeklyCount == 1 ? '' : 's'} past week.`);
    desc = desc.replace(/\$\{history\}/g, this.websiteLinks.history(set.id));
    return desc;
  }

  GetPluginStatus(): string {
    return `-- Map Checker --
  Regulation: ${this.getRegulationDescription()}`;
  }
}

export function secToTimeNotation(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class MapValidator {
  logger: Logger;
  option: MapCheckerOption;
  blacklistedIds: number[]=[];
  blacklistedNames: string[]=[];
  blackedMap: Beatmap | undefined=undefined;
  lobbyInstance: Lobby;
  //TODO: Create own type for languages and genres!!
  // languages: string[] = ['English', 'Chinese', 'French', 'German', 'Italian', 'Japanese', 'Korean', 'Spanish', 'Swedish', 'Russian', 'Polish', 'Instrumental', 'Unspecified', 'Other'];
  // genres: string[] = ['Unspecified', 'Video Game', 'Anime', 'Rock', 'Pop', 'Other', 'Novelty', 'Hip Hop', 'Electronic', 'Metal', 'Classical', 'Folk', 'Jazz'];
  // statuses: string[] = ['ranked', 'approved', 'qualified', 'loved', 'unranked', 'pending', 'wip', 'graveyard'];

  constructor(option: MapCheckerOption, logger: Logger, lobbyInstance: Lobby) {
    this.option = option;
    this.logger = logger;
    this.blacklistedIds = this.LoadFilters(this.option.blacklisted_mapset_id_path).map(Number).filter(id => !isNaN(id));
    this.blacklistedNames = this.LoadFilters(this.option.blacklisted_mapset_names_path);
    this.lobbyInstance = lobbyInstance;
  }

  LoadFilters(filePath: string): string[] {
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      const filters = data.split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');
      return filters;
    } catch (error) {
      return [];
    }
  }

  RateBeatmap(map: Beatmap, override: boolean, newStarRating: number, attributes: FixedAttributes): { rate: number, message: string }{
    let rate = 0;
    let result = "";
    let violationMsg = "";
    let starRating = map.difficulty_rating;
    let modsOn = false;

    if(newStarRating > 0){
      starRating = newStarRating;
      modsOn = true;
    }
    
    const mapmode = PlayMode.from(map.mode);
    if (mapmode !== this.option.gamemode && this.option.gamemode !== null) {
      violationMsg=`the gamemode is not ${this.option.gamemode.officialName}`;
      rate += 1;
    }

    else if (this.option.star_min > 0 && starRating < this.option.star_min) {
      rate += parseFloat((this.option.star_min - starRating).toFixed(2));
      violationMsg=`the beatmap star rating is lower than the allowed star rating`;
      if (modsOn) {
        this.lobbyInstance.SendMessage('!mp mods Freemod');
        modsOn = false;
      }
    }

    else if (this.option.star_max > 0 && this.option.star_max < starRating) {
      rate += parseFloat((starRating - this.option.star_max).toFixed(2));
      violationMsg=`the beatmap star rating is higher than the allowed star rating`;
      if (modsOn) {
        this.lobbyInstance.SendMessage('!mp mods Freemod');
        modsOn = false;
      }
    }

    else if (this.option.length_min > 0 && attributes.length < this.option.length_min) {
      rate += (this.option.length_min - attributes.length) / 60.0;
      violationMsg=`the beatmap length is shorter than the allowed length`;
    }

    else if (this.option.length_max > 0 && this.option.length_max < attributes.length) {
      rate += (attributes.length - this.option.length_max) / 60.0;
      violationMsg=`the beatmap length is longer than the allowed length`;
    }

    else if(this.option.advanced_filters.enabled && (result = this.checkBlackList(map)) !== ""){
      rate = 69;
      violationMsg = result;
    }

    else if(this.blacklistedIds.includes(map.beatmapset_id)){
      rate=69;
      this.blackedMap = map;
      violationMsg='it was found in [https://fuubot.mineapple.net/blacklist blacklisted maps list]. Please pick another map';
    }

    else if(this.blacklistedNames.includes(map.beatmapset?.title || '')){
      rate=69;
      this.blackedMap = map;
      this.silentlyAddToBlacklist();
      violationMsg='it was found in the [https://docs.google.com/spreadsheets/d/13kp8wkm3g0FYfnnEZT1YdmdAEtWQzmPuHlA7kZBYYBo/ overplayed maps list]. Please pick another map.';
    }

    else if(this.option.advanced_filters.enabled && (result = this.fixedFiltering(attributes)) !== "" || (result = this.miscFiltering(map, attributes.hit_length)) !== ""){
      rate=69;
      violationMsg=result;
    }

    else if(!override && this.option.advanced_filters.enabled && (result = this.advancedFiltering(map)) !== ""){
        rate=420;
        violationMsg=result;
    }

    if (rate > 0) {
      let message;
      const mapDesc = `[${map.url} ${map.beatmapset?.title}] (Star rating: ${starRating}, Length: ${secToTimeNotation(attributes.length)})`;
      message = `${mapDesc} was rejected because ${violationMsg}`;
      return { rate, message };
    } 
    else    
      return { rate: 0, message: '' };
  }

  GetDescription(): string {
    let desc=''
    let d_star = '';
    if (this.option.star_min > 0 && this.option.star_max > 0) {
      d_star = `${this.option.star_min.toFixed(2)}*–${this.option.star_max.toFixed(2)}*`;
    } else if (this.option.star_min > 0) {
      d_star = `${this.option.star_min.toFixed(2)}* or more`;
    } else if (this.option.star_max > 0) {
      d_star = `upto ${this.option.star_max.toFixed(2)}*`;
    }
    if(d_star) desc+=`Star Rating: ${d_star}`;
    let d_length = '';
    if (this.option.length_min > 0 && this.option.length_max > 0) {
      d_length = `${secToTimeNotation(this.option.length_min)}–${secToTimeNotation(this.option.length_max)}`;
    } else if (this.option.length_min > 0) {
      d_length = `${secToTimeNotation(this.option.length_min)} or more`;
    } else if (this.option.length_max > 0) {
      d_length = `upto ${secToTimeNotation(this.option.length_max)}`;
    }
    if(d_length) desc+=` | Length: ${d_length}`;
    let d_gamemode = ` | Mode: ${this.option.gamemode.officialName}`;
    if (this.option.gamemode !== PlayMode.Osu) {
      if (this.option.allow_convert) {
        d_gamemode += ' (Converts allowed)';
      }
      else {
        d_gamemode += ' (Converts disallowed)';
      }
    }
    desc+=d_gamemode;
    return desc;
  }

  GetAdvancedFiltersDescription(): string {
    let desc = '';
    if(this.option.advanced_filters.ar[1]){
      desc += `AR: ${this.option.advanced_filters.ar[0]}–${this.option.advanced_filters.ar[1]}`;
    }
    if(this.option.advanced_filters.cs[1]){
      if(desc) desc+=" | "
      desc += `CS: ${this.option.advanced_filters.cs[0]}–${this.option.advanced_filters.cs[1]}`;
    }
    if(this.option.advanced_filters.bpm[1]){
      if(desc) desc+=" | "
      desc += `BPM: ${this.option.advanced_filters.bpm[0]}–${this.option.advanced_filters.bpm[1]}`;
    }
    if(this.option.advanced_filters.od[1]){
      if(desc) desc+=" | "
      desc += `OD: ${this.option.advanced_filters.od[0]}–${this.option.advanced_filters.od[1]}`;
    }
    if(this.option.advanced_filters.year[1]){
      if(desc) desc+=" | "
      desc += `Years: ${this.option.advanced_filters.year[0]}–${this.option.advanced_filters.year[1]}`;
    }
    if(this.option.advanced_filters.play_count_yearly_average[1]){
      if(desc) desc+=" | "
      desc += `Yearly Playcount: ${this.option.advanced_filters.play_count_yearly_average[0]}–${this.option.advanced_filters.play_count_yearly_average[1]}`;
    }
    if(this.option.advanced_filters.stamina_formula_c_value){
      if(desc) desc+="\n";
      const staminaParts = [];
      const minutes = [1, 2, 3, 4, 6, 8, 10];
      for(let i=0; i<minutes.length; i++){
        const limit = getStaminaLimit(minutes[i], this.option.advanced_filters.stamina_formula_c_value);
        staminaParts.push(`${minutes[i]}m = ${limit.toFixed(2)}`);
      }
      const stamina_desc = staminaParts.join(' | ');
      desc += `Stamina Limit (CPS): ${stamina_desc}`;
    }
    if(this.option.advanced_filters.languages.length>0){
      if(desc) desc+="\n";
      desc += `Languages: ${this.option.advanced_filters.languages.join(', ')}`;
    }
    if(this.option.advanced_filters.genres.length>0){
      if(desc) desc+="\n";
      desc += `Genres: ${this.option.advanced_filters.genres.join(', ')}`;
    }
    if(!this.option.advanced_filters.allow_nsfw){
      if(desc) desc+="\n";
      desc += 'NSFW maps are not allowed';
    }
    return desc;
  }

  silentlyAddToBlacklist(): void {
    const mapsetId = this.blackedMap?.beatmapset_id || 0;
    if(mapsetId === 0) return;
    fs.appendFile(this.option.blacklisted_mapset_id_path, `\n${mapsetId}`, (err) => {
      if (err) {
        this.logger.error(`Failed to add [https://osu.ppy.sh/beatmapsets/${mapsetId} ${mapsetId}] to blacklisted ids`, err);
      } else {
        this.blacklistedIds.push(mapsetId);
      }
    });
  }

  checkBlackList(map: Beatmap): string {
      //tags
      if(this.option.advanced_filters.tags.deny.length>0){
        if (map.beatmapset?.tags) {
          let words = map.beatmapset.tags.split(' ');
          let denyTags = this.option.advanced_filters.tags.deny.map(tag => tag.toLowerCase());
          if(words.some(word => denyTags.includes(word.toLowerCase()))){
            const bannedWord = words.find(word => denyTags.includes(word.toLowerCase()));
            return `${bannedWord} maps are not allowed in the lobby`;
          }
        }
      }
      
      //mappers
      if(this.option.advanced_filters.mappers.deny.length>0){
        let mappers = this.option.advanced_filters.mappers.deny.map(mapper => mapper.toLowerCase());
        if (map.beatmapset?.creator) {
          let mapperLower=map.beatmapset?.creator.toLowerCase();
          if (mappers.includes(mapperLower)){
            return `this mapper was found in the [https://osu-pps.com/#/osu/mappers/pp pp mappers list]`;
          }
        }
        let diffMapper=map.version.toLowerCase();
        if(mappers.some(mapper => diffMapper.includes(mapper))){
          return `this mapper was found in the [https://osu-pps.com/#/osu/mappers/pp pp mappers list]`;
        }
      }
  
      //artists
      if(this.option.advanced_filters.artists.deny.length>0){
        if(map.beatmapset?.artist){
          let artistLower = map.beatmapset?.artist.toLowerCase();
          let artists = this.option.advanced_filters.artists.deny;
          if (artists.some(artist => artistLower.includes(artist.toLowerCase()))){
            return `songs by this artist are not allowed in the lobby`;
          }
        }
      }
      return "";
  }

  fixedFiltering(attributes: FixedAttributes): string {
    //od
    if(this.option.advanced_filters.od[1]){
      if (attributes.od < this.option.advanced_filters.od[0])
        return "the beatmap OD is lower than the allowed OD";
      if (attributes.od > this.option.advanced_filters.od[1])
        return "the beatmap OD is higher than the allowed OD";
    }
    //ar
    if(this.option.advanced_filters.ar[1]){
      if (attributes.ar < this.option.advanced_filters.ar[0])
        return "the beatmap AR is lower than the allowed AR";
      if (attributes.ar > this.option.advanced_filters.ar[1])
        return "the beatmap AR is higher than the allowed AR";
    }
    //bpm
    if(this.option.advanced_filters.bpm[1]){
      if (attributes.bpm < this.option.advanced_filters.bpm[0])
        return "the beatmap BPM is lower than the allowed BPM";
      if (attributes.bpm > this.option.advanced_filters.bpm[1])
        return "the beatmap BPM is higher than the allowed BPM";
    }
    //cs
    if(this.option.advanced_filters.cs[1]){
      if (attributes.cs < this.option.advanced_filters.cs[0])
        return "the beatmap CS is lower than the allowed CS";
      if (attributes.cs > this.option.advanced_filters.cs[1])
        return "the beatmap CS is higher than the allowed CS";
    }
    return "";
  }

  miscFiltering(map: Beatmap, hit_length: number): string {
    //playcount
    if(this.option.advanced_filters.play_count_yearly_average[1]){
      const currentYear = new Date().getFullYear();
      const beatmapYear = map.beatmapset?.submitted_date ? new Date(map.beatmapset.submitted_date).getFullYear() : 0;
      const yearsSinceSubmission = (currentYear===beatmapYear)?1:currentYear - beatmapYear;
      const avg_playcount = Math.round(map.playcount/yearsSinceSubmission);
      if (avg_playcount < this.option.advanced_filters.play_count_yearly_average[0])
        return `the beatmap has too few plays (${avg_playcount} per year)`;
      if (avg_playcount > this.option.advanced_filters.play_count_yearly_average[1])
        return `the beatmap has too many plays (${avg_playcount} per year)`;
    }
    //stamina_score
    if(this.option.advanced_filters.stamina_formula_c_value){
      const cps=(map.count_circles+map.count_sliders+map.count_spinners)/hit_length;
      const limit=getStaminaLimit(hit_length/60, this.option.advanced_filters.stamina_formula_c_value);
      if (cps > limit)
        return `the beatmap is too stamina draining! Max Stamina: ${limit.toFixed(2)} | Your Map: ${cps.toFixed(2)}`;
    }
    //year
    if(this.option.advanced_filters.year[1]){
      let dateString = map.beatmapset?.submitted_date;
      let year = 0;
      if (dateString) {
        let date = new Date(dateString);
        year = date.getFullYear();
      }
      if (year < this.option.advanced_filters.year[0])
        return "the beatmap is too old";
      if (year> this.option.advanced_filters.year[1])
        return "the beatmap is too new";
    }
    return "";
  }

  advancedFiltering(map: Beatmap): string {
    let genreFoundInTags = false;
    //nsfw
    if(!this.option.advanced_filters.allow_nsfw){
      if (map.beatmapset?.nsfw)
        return "NSFW maps are not allowed in the lobby\nType !force to pick the map anyway";
    }

    //language
    if(this.option.advanced_filters.languages.length>0){
      let langs = this.option.advanced_filters.languages.map(lang => lang.toLowerCase());
      let allowedLangs = this.option.advanced_filters.languages.join(', ');
      if (map.beatmapset?.language?.name && !langs.includes(map.beatmapset?.language?.name.toLowerCase())){
        if(map.beatmapset?.language?.name === 'Unspecified'){
          if(langs.includes('japanese')){
            if(!containsJapanese(map.beatmapset.title_unicode, map.beatmapset.artist_unicode) && !checkTags(map.beatmapset?.tags)){
              return "beatmap language couldn't be determined (missing metadata)\nType !force to pick the map anyway";
            }
          }
          else{
            return "beatmap language couldn't be determined (missing metadata)\nType !force to pick the map anyway";
          }
        }
        else 
          return `only ${allowedLangs} maps are allowed in the lobby\nType !force to pick the map anyway`;
      }
    }

    //genre_tags
    if(this.option.advanced_filters.tags.genre_tags.length>0){
      if (map.beatmapset?.tags){
        let genre_tags = this.option.advanced_filters.tags.genre_tags.flatMap(tag => tag.toLowerCase().split(' '));
        let words = map.beatmapset?.tags.split(' ').map(word => word.toLowerCase());
        if(words.some(word => genre_tags.includes(word.toLowerCase()))){
          genreFoundInTags = true;
        }
      }
    }

    //genres
    if(this.option.advanced_filters.genres.length>0){
      if(map.beatmapset?.genre?.name){
        let allowedGenres = this.option.advanced_filters.genres.join(', ');
        let genresToCheck = this.option.advanced_filters.genres.map(genre => genre.toLowerCase());
        if(!genreFoundInTags && map.beatmapset?.genre?.name === 'Unspecified'){
            return `beatmap genre couldn't be determined (missing metadata)\nType !force to pick the map anyway`;
        }
        else if(!genreFoundInTags && !genresToCheck.includes(map.beatmapset?.genre?.name.toLowerCase())){
            return `only ${allowedGenres} maps are allowed in the lobby\nType !force to pick the map anyway`;
        }
      }
    }

    //statuses
    if(this.option.advanced_filters.statuses.length>0){
      let statuses = this.option.advanced_filters.statuses;
      let allowedStatuses = statuses.join(', ');
      if (map.beatmapset?.status && !this.option.advanced_filters.statuses.includes(map.beatmapset?.status)){
        return `only ${allowedStatuses} maps are allowed in the lobby\nType !force to pick the map anyway`;
      }
    }

    //tags
    if(this.option.advanced_filters.tags.allow.length>0){
      if (map.beatmapset?.tags){
        let tags = this.option.advanced_filters.tags.allow.map(tag => tag.toLowerCase());
        let words = map.beatmapset?.tags.split(' ').map(word => word.toLowerCase());
        if(!words.some(word => tags.includes(word.toLowerCase()))){
          return `beatmap with such tags are not allowed in the lobby\nType !force to pick the map anyway`;
        }
      }
      else{
        return "beatmap tags couldn't be determined (missing metadata)\nType !force to pick the map anyway";
      }
    }

    //mappers
    if(this.option.advanced_filters.mappers.allow.length>0){
      let mappers = this.option.advanced_filters.mappers.allow.map(mapper => mapper.toLowerCase());
      let allowedMappers = this.option.advanced_filters.mappers.allow.join(', ');
      let diffMapper=map.version.toLowerCase();
      if(!mappers.some(mapper => diffMapper.includes(mapper)) && map.beatmapset?.creator){
        let mapperLower=map.beatmapset.creator.toLowerCase();
        if (!mappers.includes(mapperLower)){
          return `only ${allowedMappers} maps are allowed in the lobby\nType !force to pick the map anyway`;
        }
      }
    }

    //artists
    if(this.option.advanced_filters.artists.allow.length>0){
      if(map.beatmapset?.artist){
        let mapArtists = map.beatmapset?.artist.toLowerCase();
        let artists = this.option.advanced_filters.artists.allow;
        let allowedArtists = artists.join(', ');
        if (!artists.some(artist => mapArtists.includes(artist.toLowerCase()))){
          return `only ${allowedArtists} maps are allowed in the lobby\nType !force to pick the map anyway`;
        }
      }
    }
    return "";
  }
}

function getStaminaLimit(L: number, C: number): number{
  if(L <= 2) //less than 2 minutes
    return 0.8*C/L+0.6*C; //formula 1
  else //more than 2 minutes
    return 0.8*C/(L-12)+1.08*C; //formula 2
}

function containsJapanese(title: string, artist: string): boolean {
  const regex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/u;
  return regex.test(title) || regex.test(artist);
}

function checkTags(text: string): boolean {
  const allowedTags=['japanese', 'jpop', 'jrock', 'vn', 'j-pop', 'anime', 'j-rock', 'instrumental'];
  return allowedTags.some(tag => text.includes(tag));
}


function validateMapCheckerOption(option: MapCheckerUncheckedOption): option is Partial<MapCheckerOption> {
  if (option.enabled !== undefined) {
    option.enabled = validateOption.bool('MapChecker.enabled', option.enabled);
  }

  if (option.star_min !== undefined) {
    option.star_min = validateOption.number('MapChecker.star_min', option.star_min, 0);
  }

  if (option.star_max !== undefined) {
    option.star_max = validateOption.number('MapChecker.star_max', option.star_max, 0);
  }

  if (option.length_min !== undefined) {
    option.length_min = validateOption.number('MapChecker.length_min', option.length_min, 0);
  }

  if (option.length_max !== undefined) {
    option.length_max = validateOption.number('MapChecker.length_max', option.length_max, 0);
  }

  if (option.star_max !== undefined && option.star_min !== undefined && option.star_max <= option.star_min && option.star_max > 0) {
    option.star_min = 0;
  }

  if (option.length_max !== undefined && option.length_min !== undefined && option.length_max <= option.length_min && option.length_max > 0) {
    option.length_min = 0;
  }

  if (option.gamemode !== undefined) {
    if (typeof option.gamemode === 'string') {
      try {
        option.gamemode = PlayMode.from(option.gamemode, true);

      } catch {
        throw new Error('MapChecker#validateMapCheckerOption: Option must be [osu | fruits | taiko | mania]');
      }
    }

    if (!(option.gamemode instanceof PlayMode)) {
      throw new Error('MapChecker#validateMapCheckerOption: Option must be [osu | fruits | taiko | mania]');
    }
  }

  if (option.num_violations_to_skip !== undefined) {
    option.num_violations_allowed = option.num_violations_to_skip;
  }
  if (option.num_violations_allowed !== undefined) {
    option.num_violations_allowed = validateOption.number('MapChecker.num_violations_allowed', option.num_violations_allowed, 0);
  }

  if (option.allowConvert !== undefined) {
    option.allow_convert = option.allowConvert;
  }
  if (option.allow_convert !== undefined) {
    option.allow_convert = validateOption.bool('MapChecker.allow_convert', option.allow_convert);
  }
  return true;
}

/**
 * function for processing owner commands
 * Separated from MapChecker for ease of testing
 */
export function parseMapcheckerOwnerCommand(command: string, param: string): Partial<MapCheckerOption> | undefined {
  let option: undefined | MapCheckerUncheckedOption = undefined;
  command = command.toLocaleLowerCase();
  if (command === '*mapchecker_enable') {
    return { enabled: true };
  }
  if (command === '*mapchecker_disable') {
    option = { enabled: false };
  }

  if (command.startsWith('*regulation')) {
    if (param.indexOf('=') !== -1) {
      option = parseRegulationSetter(param);
    } else {
      const params = param.split(/\s+/).map(s => s.toLowerCase()).filter(s => s !== '');
      option = parseRegulationCommand(params);
    }
  }

  if (command === '*no' && param.startsWith('regulation')) {
    const params = param.split(/\s+/).map(s => s.toLowerCase()).filter(s => s !== '');
    if (params.length === 1) {
      option = { enabled: false };
    } else {
      option = parseNoRegulationCommand(params[1]);
    }
  }
  if (option !== undefined) {
    validateMapCheckerOption(option);
  }
  return option;
}

function parseRegulationCommand(params: string[]): MapCheckerUncheckedOption {
  switch (unifyParamName(params[0])) {
    case 'enabled':
      return { enabled: true };
    case 'disabled':
      return { enabled: false };
    case 'num_violations_allowed':
      if (params.length < 2) throw new Error('Missing parameter. *regulation num_violations_allowed [number]');
      return { num_violations_allowed: params[1] };
    case 'star_min':
      if (params.length < 2) throw new Error('Missing parameter. *regulation star_min [number]');
      return { star_min: params[1] };
    case 'star_max':
      if (params.length < 2) throw new Error('Missing parameter. *regulation star_max [number]');
      return { star_max: params[1] };
    case 'length_min':
      if (params.length < 2) throw new Error('Missing parameter. *regulation length_min [number]');
      return { length_min: params[1] };
    case 'length_max':
      if (params.length < 2) throw new Error('Missing parameter. *regulation length_max [number]');
      return { length_max: params[1] };
    case 'gamemode':
      if (params.length < 2) throw new Error('Missing parameter. *regulation gamemode [osu | fruits | taiko | mania]');
      return { gamemode: params[1] };
    case 'allow_convert':
      if (params.length < 2) {
        return { allow_convert: true };
      } else {
        return { allow_convert: params[1] };
      }
    case 'disallow_convert':
      return { allow_convert: false };
  }
  throw new Error('Missing parameter. *regulation [enable | disable | star_min | star_max | length_min | length_max | gamemode | num_violations_allowed] <...params>');
}

function parseNoRegulationCommand(param: string): MapCheckerUncheckedOption | undefined {
  switch (unifyParamName(param)) {
    case 'num_violations_allowed':
      return { num_violations_allowed: 0 };
    case 'star_min':
      return { star_min: 0 };
    case 'star_max':
      return { star_max: 0 };
    case 'length_min':
      return { length_min: 0 };
    case 'length_max':
      return { length_max: 0 };
    case 'gamemode':
      return { gamemode: PlayMode.Osu, allow_convert: true };
    case 'allow_convert':
      return { allow_convert: false };
  }
}

function parseRegulationSetter(param: string): MapCheckerUncheckedOption {
  const result: { [key: string]: string } = {};
  for (const m of param.matchAll(/([0-9a-zA-Z_-]+)\s*=\s*([^\s,]+)/g)) {
    const name = unifyParamName(m[1]);
    const value = m[2];
    result[name] = value;
  }
  return result;
}

function unifyParamName(name: string): string {
  name = name.toLowerCase();

  if (name.includes('star') || name.includes('diff')) {
    if (name.includes('low') || name.includes('min')) {
      return 'star_min';
    } else if (name.includes('up') || name.includes('max')) {
      return 'star_max';
    }
  } else if (name.includes('len')) {
    if (name.includes('low') || name.includes('min')) {
      return 'length_min';
    } else if (name.includes('up') || name.includes('max')) {
      return 'length_max';
    }
  } else if (name.startsWith('enable')) {
    return 'enabled';
  } else if (name.startsWith('disable')) {
    return 'disabled';
  } else if (name === 'num_violations_to_skip' || name.includes('violations')) {
    return 'num_violations_allowed';
  } else if (name === 'allowconvert') {
    return 'allow_convert';
  } else if (name === 'disallowconvert') {
    return 'disallow_convert';
  }
  return name;
}

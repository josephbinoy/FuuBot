import { Lobby } from '../Lobby';
import { Player } from '../Player';
import { LobbyPlugin } from './LobbyPlugin';
import { BanchoResponseType } from '../parsers/CommandParser';
import { BeatmapRepository, FetchBeatmapError, FetchBeatmapErrorReason } from '../webapi/BeatmapRepository';
import { WebApiClient } from '../webapi/WebApiClient';

/**
 * Get beatmap mirror link from Beatconnect
 * Use !mirror to fetch the mirror link
 */
export class MiscLoader extends LobbyPlugin {
  canResend: boolean = true;
  beatconnectURL: string = 'https://beatconnect.io/b/${beatmapset_id}';
  kitsuURL: string = 'https://kitsu.moe/d/${beatmapset_id}';
  canSeeRank: boolean = false;

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
      const kitsuLink = this.kitsuURL.replace(/\$\{beatmapset_id\}/g, map.beatmapset_id.toString());
      const beatmapView = map.beatmapset?.title.toString();
      this.lobby.SendMessageWithCoolTime(`Alternative download link for beatmap ${beatmapView}: [${beatconnectLink} BeatConnect.io] | [${kitsuLink} Kitsu.moe]`, '!mirror', 5000);
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

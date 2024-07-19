import { LobbyPlugin } from './LobbyPlugin';
import { Lobby } from '../Lobby';

export interface LobbyTerminatorOption {
  terminate_time_ms: number;
}

export class LobbyTerminator extends LobbyPlugin {
  constructor(lobby: Lobby) {
    super(lobby, 'LobbyTerminator', 'terminator');
  }

  CloseLobby(time_ms: number = 0): void {
    if (time_ms === 0) {
      if (this.lobby.players.size === 0) {
        this.logger.info('Terminated the lobby.');
        this.lobby.CloseLobbyAsync();
      } else {
        this.lobby.SendMultilineMessageWithInterval([
          '!mp password closed',
          'This lobby will be closed when everyone leaves.',
          'Thank you for playing with the auto host rotation lobby.'
        ], 1000, 'close lobby announcement', 100000);
      }
    } else {
      this.lobby.SendMultilineMessageWithInterval([
        '!mp password closed',
        `This lobby will be closed in ${(time_ms / 1000).toFixed(0)}sec(s).`,
        'Thank you for playing with the auto host rotation lobby.'
      ], 1000, 'close lobby announcement', 100000)
        .then(() => this.sendMessageWithDelay('!mp close', time_ms));
    }
  }

  private sendMessageWithDelay(message: string, delay: number): Promise<void> {
    return new Promise<void>(resolve => {
      setTimeout(() => {
        this.lobby.SendMessage(message);
        resolve();
      }, delay);
    });
  }
}

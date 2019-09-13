import { assert } from 'chai';
import { Lobby, LobbyStatus, Player, PlayerStatus, Roles, Teams } from '..';
import { DummyIrcClient, DummyLobbyPlugin } from '../dummies';
import log4js from "log4js";
import tu from "./TestUtils";
import { MpSettingsCases } from "./cases/MpSettingsCases";
import { MpSettingsResult } from '../parsers';
import { IIrcClient } from '../IIrcClient';

describe("LobbyTest", function () {
  before(function () {
    log4js.configure("config/log_mocha_silent.json");
  });
  interface LobbyTestBasicSet {
    ircClient: DummyIrcClient;
    lobby: Lobby;
    players: Player[];
  }

  // テスト用にロビー作成済み、プレイヤー追加済みのロビーを作成する。
  async function PrepareLobbyWith3Players(): Promise<LobbyTestBasicSet> {
    const ircClient = new DummyIrcClient("osu_irc_server", "creator");
    const lobby = new Lobby(ircClient);
    await lobby.MakeLobbyAsync("test");
    const pids = ["user1", "user2", "user3"];
    const players: Player[] = [];
    for (let p of pids) {
      await ircClient.emulateAddPlayerAsync(p);
      players.push(lobby.GetOrMakePlayer(p));
    }
    return {
      ircClient: ircClient,
      lobby: lobby,
      players: players
    };
  }

  describe("lobby management tests", function () {
    // ロビー作成、ロビー終了テスト
    it("make&close lobby test", async () => {
      const ircClient = new DummyIrcClient("osu_irc_server", "creator");
      //logIrcEvent(ircClient);
      const lobby = new Lobby(ircClient);
      const name = "test";
      const id = await lobby.MakeLobbyAsync(name);
      assert.equal(lobby.lobbyId, id);
      assert.equal(lobby.channel, ircClient.channel);
      assert.equal(lobby.lobbyName, name);
      assert.equal(lobby.status, LobbyStatus.Entered);
      lobby.SendMessage("!mp password");
      lobby.SendMessage("!mp invite gnsksz");

      await lobby.CloseLobbyAsync();
    });

    // 名前無しロビーの作成
    it("try to make no name lobby test", async () => {
      const ircClient = new DummyIrcClient("osu_irc_server", "creator");
      const lobby = new Lobby(ircClient);
      const name = "";
      try {
        await lobby.MakeLobbyAsync(name);
        assert.fail();
      } catch (e) { }
    });

    // ロビーを二回作成
    it("make lobby twice test", async () => {
      const ircClient = new DummyIrcClient("osu_irc_server", "creator");
      const lobby = new Lobby(ircClient);
      try {
        lobby.MakeLobbyAsync("1");
        lobby.MakeLobbyAsync("2");
        assert.fail();
      } catch { }
    });

    // 無効な状態でロビーを閉じる
    it("close unopened lobby test", async () => {
      const ircClient = new DummyIrcClient("osu_irc_server", "creator");
      const lobby = new Lobby(ircClient);
      try {
        await lobby.CloseLobbyAsync();
        assert.fail();
      } catch { }
    });
  });

  describe("join left tests", function () {
    // プレイヤーの入室
    it("player join test", async () => {
      const ircClient = new DummyIrcClient("osu_irc_server", "creator");
      //logIrcEvent(ircClient);
      const lobby = new Lobby(ircClient);
      await lobby.MakeLobbyAsync("test");

      // プレイヤー追加
      const players = ["user1", "user 2", "user_3"];
      const joiningPlayers: Set<string> = new Set<string>(players);
      const jp = new Promise<void>(resolve => {
        lobby.PlayerJoined.on(({ player, slot }) => {
          assert.isTrue(joiningPlayers.has(player.id));
          joiningPlayers.delete(player.id);
          if (joiningPlayers.size == 0) {
            resolve();
          }
        });
      });
      for (let p of players) {
        await ircClient.emulateAddPlayerAsync(p);
      }
      await jp;

      // 参加人数を調べる
      assert.equal(players.length, lobby.players.size);

      for (let p of lobby.players) {
        // 参加者が一致しているか調べる
        assert.isTrue(players.includes(p.id));

        // プレイヤーの状態をチェック
        assert.equal(p.role, Roles.Player);
        assert.isFalse(p.isAuthorized);
        assert.isFalse(p.isCreator);
        assert.isFalse(p.isHost);
        assert.isFalse(p.isReferee);
        assert.equal(p.status, PlayerStatus.InLobby);
        assert.equal(p.team, Teams.None);
      }
    });

    // プレイヤーの退出　一人
    it("player left test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();

      // 一人だけ退出
      const leftindex = 1;
      const lp = new Promise<void>(resolve => {
        lobby.PlayerLeft.on(player => {
          assert.equal(player, players[leftindex]);
          resolve();
        });
      });
      await ircClient.emulateRemovePlayerAsync(players[leftindex].id);
      await lp;

      // 参加人数を調べる
      assert.equal(lobby.players.size, players.length - 1);
      // 退出した人が含まれていないか調べる
      assert.isFalse(lobby.players.has(players[leftindex]));
    });

    // 入退出
    it("player join&left test", async () => {
      const ircClient = new DummyIrcClient("osu_irc_server", "creator");
      //logIrcEvent(ircClient);
      const lobby = new Lobby(ircClient);
      await lobby.MakeLobbyAsync("test");
      const players = ["user1", "user 2", "user_3"];

      await ircClient.emulateAddPlayerAsync(players[0]);
      assert.isTrue(lobby.Includes(players[0]));
      await ircClient.emulateRemovePlayerAsync(players[0]);
      assert.isFalse(lobby.Includes(players[0]));

      await ircClient.emulateAddPlayerAsync(players[0]);
      await ircClient.emulateAddPlayerAsync(players[1]);
      await ircClient.emulateAddPlayerAsync(players[2]);
      await ircClient.emulateRemovePlayerAsync(players[1]);
      assert.isTrue(lobby.Includes(players[0]));
      assert.isFalse(lobby.Includes(players[1]));
      assert.isTrue(lobby.Includes(players[2]));
    });

    // 想定外の入室/退室
    it("unexpected join and left test", async () => {
      const ircClient = new DummyIrcClient("osu_irc_server", "creator");
      const lobby = new Lobby(ircClient);
      await lobby.MakeLobbyAsync("test");

      let f = 0;
      lobby.UnexpectedAction.on(err => {
        f = f + 1;
      });
      await ircClient.emulateRemovePlayerAsync("unknown player");
      assert.equal(f, 1);

      f = 0;
      ircClient.emulateAddPlayerAsync("tom");
      ircClient.emulateAddPlayerAsync("jim");
      ircClient.emulateAddPlayerAsync("tom");
      assert.equal(f, 1);
    });
    it("host change test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      const assertHost = async (next: Player) => {
        return new Promise<Player>(resolve => {
          lobby.HostChanged.once(({ succeeded, player }) => {
            assert.equal(player, next);
            tu.assertHost(next.id, lobby);
            assert.equal(lobby.hostPending, null);
            resolve(player);
          });
        });
      }
      let nexthost = players[0];
      let task = assertHost(nexthost);
      lobby.TransferHost(nexthost);
      await task;

      nexthost = players[1];
      task = assertHost(nexthost);
      lobby.TransferHost(nexthost);
      await task;
    });

    // ホスト任命後に離脱した場合
    it("host change & left test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      const getNewHostAsync = async () => {
        return new Promise<Player>(resolve => {
          lobby.HostChanged.once(({ succeeded, player }) => {
            assert.isFalse(succeeded);
            resolve(player);
          });
        });
      }
      //logIrcEvent(ircClient);
      let nexthost = players[0];
      let taskHost = getNewHostAsync();
      let taskLeft = ircClient.emulateRemovePlayerAsync(nexthost.id);
      lobby.TransferHost(nexthost);
      let host = await taskHost;
      await taskLeft;
      assert.equal(host, nexthost);
    });
  });

  describe("match tests", function () {
    // 試合テスト
    it("match start test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      //logIrcEvent(ircClient);
      let ms = false;
      let mf = false;
      const finishedplayers = new Set<Player>();

      lobby.MatchStarted.on(() => {
        ms = true;
        assert.isFalse(mf);
      });
      lobby.PlayerFinished.on(({ player, score, isPassed }) => {
        assert.isFalse(finishedplayers.has(player));
        finishedplayers.add(player);
        assert.isTrue(ms);
        assert.isFalse(mf);
      });
      lobby.MatchFinished.on(() => {
        mf = true;
        assert.isTrue(ms);
        assert.equal(finishedplayers.size, players.length);
        for (let p of players) {
          assert.isTrue(finishedplayers.has(p));
        }
      });
      await ircClient.emulateMatchAsync(0);
    });

    // 試合中の退出テスト
    it("match and left test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      //logIrcEvent(ircClient);
      let ms = false;
      let mf = false;
      const finishedplayers = new Set<Player>();
      const leftplayerindex = 1;

      lobby.MatchStarted.on(() => {
        ms = true;
        assert.isFalse(mf);
      });
      lobby.PlayerFinished.on(({ player, score, isPassed }) => {
        assert.isFalse(finishedplayers.has(player));
        finishedplayers.add(player);
        assert.isTrue(ms);
        assert.isFalse(mf);
      });
      lobby.MatchFinished.on(() => {
        mf = true;
        assert.isTrue(ms);
        assert.equal(finishedplayers.size, players.length - 1);
        assert.isFalse(finishedplayers.has(players[leftplayerindex]));
      });
      const p = ircClient.emulateMatchAsync(10);
      await ircClient.emulateRemovePlayerAsync(players[leftplayerindex].id);
      await p;
    });

    // 試合中断テスト
    it("match and abort test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      //logIrcEvent(ircClient);
      let ms = false;
      let ma = false;

      lobby.MatchStarted.on(() => {
        ms = true;
        assert.isFalse(ma);
      });
      lobby.PlayerFinished.on(({ player, score, isPassed }) => {
        assert.fail();
      });
      lobby.MatchFinished.on(() => {
        assert.fail();
      });
      lobby.AbortedMatch.on(() => {
        ma = true;
        assert.isTrue(ms);
      });

      const p = ircClient.emulateMatchAsync(10);
      lobby.AbortMatch();
      await p;
      assert.isTrue(ms);
      assert.isTrue(ma);
    });
    it("match aborted before some players finished", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let ma = false;
      lobby.AbortedMatch.on((a) => {
        ma = true;
        assert.equal(a.playersFinished, 0);
        assert.equal(a.playersInGame, 3);
      });
      const p = ircClient.emulateMatchAsync(10);
      lobby.AbortMatch();
      await p;
      assert.isTrue(ma);
    });
    it("match aborted after some players left", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let ma = false;
      lobby.AbortedMatch.on((a) => {
        ma = true;
        assert.equal(a.playersFinished, 0);
        assert.equal(a.playersInGame, 2);
      });
      const p = ircClient.emulateMatchAsync(10);
      await ircClient.emulateRemovePlayerAsync("user1");
      lobby.AbortMatch();
      await p;
      assert.isTrue(ma);
    });
    it("match aborted after some players finished", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let ma = false;
      lobby.AbortedMatch.on((a) => {
        ma = true;
        assert.equal(a.playersFinished, 1);
        assert.equal(a.playersInGame, 3);
      });
      const p = ircClient.emulateMatchAsync(10);
      await ircClient.emulatePlayerFinishAsync("user1");
      lobby.AbortMatch();
      await p;
      assert.isTrue(ma);
    });
    it("match aborted after some players left and remainders finished", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let ma = false;
      lobby.AbortedMatch.on((a) => {
        ma = true;
        assert.equal(a.playersFinished, 2);
        assert.equal(a.playersInGame, 2);
      });
      const p = ircClient.emulateMatchAsync(10);
      await ircClient.emulatePlayerFinishAsync("user1");
      await ircClient.emulateRemovePlayerAsync("user2");
      await ircClient.emulatePlayerFinishAsync("user3");
      lobby.AbortMatch();
      await p;
      assert.isTrue(ma);
    });
    it("player statuses count test", async () => {
      function assertPc(lobby: Lobby, total: number, inLobby: number, playing: number) {
        let pc = lobby.countPlayersStatus();
        assert.equal(pc.inlobby, inLobby);
        assert.equal(pc.inGame, total - inLobby);
        assert.equal(pc.playing, playing);
        assert.equal(pc.finished, total - inLobby - playing);
        assert.equal(pc.total, total);
        assert.equal(lobby.playersFinished, total - inLobby - playing);
        assert.equal(lobby.playersInGame, total - inLobby);
      }

      const { lobby, ircClient } = await tu.SetupLobbyAsync();
      const players = await tu.AddPlayersAsync(5, ircClient);
      lobby.RaiseHostChanged(players[0]);
      assertPc(lobby, 5, 5, 0);

      await ircClient.emulateRemovePlayerAsync(players[4]);
      assertPc(lobby, 4, 4, 0);

      const mt = ircClient.emulateMatchAsync(10);
      await tu.AddPlayersAsync(1, ircClient);
      assertPc(lobby, 5, 1, 4);

      await ircClient.emulateRemovePlayerAsync(players[3]);
      assertPc(lobby, 4, 1, 3);

      ircClient.emulatePlayerFinishAsync(players[0]);
      assertPc(lobby, 4, 1, 2);

      await mt;
      assertPc(lobby, 4, 4, 0);

    })
  });

  describe("message handling tests", function () {
    it("send message test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let ma = false;
      const msg = "hello world";
      lobby.SentMessage.once((message) => {
        assert.equal(message, msg);
        ma = true;
      });
      lobby.SendMessage(msg);
      await tu.delayAsync(10);
      assert.isTrue(ma);
    });
    it("SendMessageWithCoolTime test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let ma = 0;
      const msg = "hello world";
      lobby.SentMessage.on((message) => {
        assert.equal(message, msg);
        ma = ma + 1;
      });
      assert.isTrue(lobby.SendMessageWithCoolTime(msg, "tag", 10));
      assert.equal(ma, 1);
      assert.isFalse(lobby.SendMessageWithCoolTime(msg, "tag", 10));
      assert.equal(ma, 1);
      await tu.delayAsync(15);
      assert.isTrue(lobby.SendMessageWithCoolTime(msg, "tag", 10));
      assert.equal(ma, 2);
      assert.isTrue(lobby.SendMessageWithCoolTime(msg, "tag2", 10));
      assert.equal(ma, 3);
      assert.isFalse(lobby.SendMessageWithCoolTime(msg, "tag2", 10));
      assert.equal(ma, 3);
    });
    it("SendMessageWithCoolTime function type message", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let mf = false;
      const msg = () => {
        return "a" + "b" + "c";
      };
      lobby.SentMessage.on((message) => {
        assert.equal(message, msg());
        mf = true;
      });
      assert.isTrue(lobby.SendMessageWithCoolTime(msg, "tag", 10));
      await tu.delayAsync(10);
      assert.isTrue(mf);
    });
    it("PlayerChated event", (done) => {
      PrepareLobbyWith3Players().then(({ ircClient, lobby, players }) => {
        const msg = "hello world";
        let mf = false;
        lobby.PlayerChated.once(a => {
          assert.equal(a.player, players[0]);
          assert.equal(a.message, msg);
          done();
        });
        lobby.RecievedBanchoResponse.once(a => {
          assert.fail();
        });
        lobby.ReceivedCustomCommand.once(a => {
          assert.fail();
        });
        ircClient.emulateMessage(players[0].id, ircClient.channel, msg);
      });
    });
    it("BanchoChated event", done => {
      PrepareLobbyWith3Players().then(({ ircClient, lobby, players }) => {
        const msg = "hello world";
        let mf = false;
        lobby.PlayerChated.once(a => {
          assert.fail();
        });
        lobby.RecievedBanchoResponse.once(a => {
          assert.equal(a.message, msg);
          done();
        });
        lobby.ReceivedCustomCommand.once(a => {
          assert.fail();
        });
        ircClient.emulateMessage("BanchoBot", ircClient.channel, msg);
      });
    });
    it("ReceivedCustomCommand", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let ma = 0;
      let msg = "!hello world";

      lobby.PlayerChated.once(a => {
        assert.equal(a.message, msg);
      });
      lobby.RecievedBanchoResponse.once(a => {
        assert.fail();
      });
      lobby.ReceivedCustomCommand.once(a => {
        assert.isFalse(a.player.isHost);
        assert.equal(a.command, "!hello");
        assert.equal(a.param, "world");
        assert.equal(a.player, players[0]);
        ma = 1;
      });
      ircClient.emulateMessage(players[0].id, ircClient.channel, msg);
      await tu.delayAsync(5);
      assert.equal(ma, 1);
    });
    it("ReceivedCustomCommand", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      let ma = 0;
      lobby.TransferHost(players[0]);
      let msg = "!hoge piyo";
      lobby.PlayerChated.once(a => {
        assert.equal(a.message, msg);
      });
      lobby.ReceivedCustomCommand.once(a => {
        assert.isTrue(a.player.isHost);
        assert.equal(a.command, "!hoge");
        assert.equal(a.param, "piyo");
        assert.equal(a.player, players[0]);
        ma = 1;
      });
      ircClient.emulateMessage(players[0].id, ircClient.channel, msg);
      await tu.delayAsync(5);
      assert.equal(ma, 1);
    });
  });

  describe("message tests", function () {
    it.skip("showInfoMessage test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      tu.configMochaAsNoisy();
      lobby.RaiseReceivedCustomCommand(lobby.GetOrMakePlayer("tester"), "!info");
    });
    it.skip("SendMessageWithDelayAsync test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      tu.configMochaAsNoisy();
      lobby.SendMessage("hello");
      lobby.SendMessageWithDelayAsync("world", 1000);
    });
    it.skip("SendMultilineMessageWithInterval test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      tu.configMochaAsNoisy();
      lobby.SendMultilineMessageWithInterval(["a", "b", "c", "d"], 1000, "a", 100);
      lobby.SendMultilineMessageWithInterval(["e", "f", "g", "h"], 1000, "a", 100);
    });
    it.skip("DeferMessage test", async () => {
      const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
      tu.configMochaAsNoisy();
      lobby.DeferMessage("a", "abc", 10, false);
      await tu.delayAsync(20);
      lobby.DeferMessage("b", "abc", 10, false);
      await tu.delayAsync(5);
      lobby.DeferMessage("c", "abc", 10, false);
      await tu.delayAsync(5);
      lobby.DeferMessage("d", "abc", 10, false);
      await tu.delayAsync(5);
      lobby.DeferMessage("e", "abc", 10, false);
      await tu.delayAsync(20);
      lobby.DeferMessage("xa", "abc", 10, true);
      await tu.delayAsync(20);
      lobby.DeferMessage("xb", "abc", 10, true);
      await tu.delayAsync(5);
      lobby.DeferMessage("xc", "abc", 10, true);
      await tu.delayAsync(5);
      lobby.DeferMessage("xd", "abc", 10, true);
      await tu.delayAsync(5);
      lobby.DeferMessage("xe", "abc", 10, true);
      await tu.delayAsync(20);
    });
  });
  describe("mp settings load tests", function() {
    async function emulateMpSettingsResponse(ircClient:DummyIrcClient, texts:string[]) {
      for(let m of texts) {
        await ircClient.emulateMessageAsync("BanchoBot", ircClient.channel, m);
      }
    }

    function assertMpSettingsResult(lobby:Lobby, result:MpSettingsResult) {
      assert.equal(lobby.players.size, result.players.length);
      for(let r of result.players) {
        const p = lobby.GetPlayer(r.id);
        if (p == null) {
          assert.fail();
          return;
        }
        assert.isTrue(lobby.players.has(p));
        assert.isTrue(p.is(Roles.Player));
        assert.equal(p.isHost, r.isHost);
      }
    }   
    it("load settings, empty lobby", async() =>{
      const {lobby, ircClient} = await tu.SetupLobbyAsync();
      const c1 = MpSettingsCases.case1_1;
      await ircClient.emulateMessageAsync(ircClient.nick, ircClient.channel, "!mp settings");
      await emulateMpSettingsResponse(ircClient, c1.texts);
      assertMpSettingsResult(lobby, c1.result);
    });
    it("load settings, change host", async() =>{
      const {lobby, ircClient} = await tu.SetupLobbyAsync();
      const c1_1 = MpSettingsCases.case1_1;
      const c1_2 = MpSettingsCases.case1_2;
      await ircClient.emulateMessageAsync(ircClient.nick, ircClient.channel, "!mp settings");
      await emulateMpSettingsResponse(ircClient, c1_1.texts);
      assertMpSettingsResult(lobby, c1_1.result);
      await emulateMpSettingsResponse(ircClient, c1_2.texts);
      assertMpSettingsResult(lobby, c1_2.result);
    });
    it("load settings, resore", async() =>{
      const {lobby, ircClient} = await tu.SetupLobbyAsync();
      const c1_1 = MpSettingsCases.case1_1;
      const c1_2 = MpSettingsCases.case1_2;
      await ircClient.emulateMessageAsync(ircClient.nick, ircClient.channel, "!mp settings");
      await emulateMpSettingsResponse(ircClient, c1_1.texts);
      assertMpSettingsResult(lobby, c1_1.result);

      await ircClient.emulateRemovePlayerAsync("gnsksz");
      await ircClient.emulateRemovePlayerAsync("Discuzz");
      await ircClient.emulateRemovePlayerAsync("Seidosam");
      await ircClient.emulateAddPlayerAsync("p1");
      await ircClient.emulateAddPlayerAsync("p2");
      await ircClient.emulateAddPlayerAsync("p3");

      await emulateMpSettingsResponse(ircClient, c1_2.texts);
      assertMpSettingsResult(lobby, c1_2.result);
    });
  });
  it.skip("plugin test", async () => {
    const { ircClient, lobby, players } = await PrepareLobbyWith3Players();
    const lp = new DummyLobbyPlugin(lobby);
    console.log(lobby.GetLobbyStatus());
  });
  describe("Reproduction of bug that occurred", function () {
    it("some chat cant handle as chat", async () => {
      const { lobby, ircClient } = await tu.SetupLobbyAsync();
      await tu.AddPlayersAsync(5, ircClient);
      ircClient.emulateMessage("BanchoBot", ircClient.channel, "Omen de cobra joined in slot 2.");
      await tu.delayAsync(10);
      assert.isTrue(lobby.Includes("Omen de cobra"));
      assert.isTrue(lobby.Includes("Omen_de_cobra"));
      ircClient.emulateMessage("Omen_de_cobra", ircClient.channel, " is this winnner rotation?");
    });
    it("creator role check", async () => {
      const { lobby, ircClient } = await tu.SetupLobbyAsync();
      await tu.AddPlayersAsync([tu.ownerNickname], ircClient);
      let p = lobby.GetPlayer(tu.ownerNickname);
      assert.isNotNull(p);
      p = p as Player;
      assert.isTrue(p.isCreator);
      assert.isTrue(p.isAuthorized);
      assert.isFalse(p.isHost);
    });
  });
});

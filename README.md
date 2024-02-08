
# jpn-autohost (minor tweaks to Meowhal's [original autohost bot](https://github.com/Meowhal/osu-ahr))

An Auto Host Rotation bot for [osu!](https://osu.ppy.sh/home) multiplayer.  
The host rotation is managed with a queue. Players are added to the queue when joining a multiplayer lobby and are sent to the back of the queue once their beatmap has been played.

## Features I added:
- ~~Banned top 100 most overplayed maps in 3-5* lobbies (Looking at you sound chimera and bass slut)~~ (Making it japanese-only ended up filtering out most of the garbage)
- Only Japanese maps allowed Edit: Added Instrumental maps

## Features I removed:
- Completely Removed Discord integration as I'm using a Raspberry Pi 4 to run the bot 24/7
- Removed typescript transpiled javascript files (dist folder) as I plan to add more features to this bot in the future. Indirectly added a couple extra steps in setup process.

# Command List

## Player Commands

|Command|Description|
|:--|:--|
|`!queue`| Shows host queue.|
|`!skip`| Triggers vote to skip current host.|
|`!start`| Triggers vote start the match.|
|`!abort`| Triggers vote abort the match. Use when the match is stuck.|
|`!update`| Updates current selected map to the latest version. Use when a host picks an outdated map.|
|`!regulations`| Shows any current regulations.|
|`!rank`| Show player rank.|

## Host Commands

|Command|Description|Example|
|:--|:--|:--|
|`!skip`| Transfers host to next player in the queue.||
|`!start [seconds]`| Starts the match after a set time in seconds.|`!start 30`|
|`!stop`| Stops active start timer.||
|`!version` or `!v`| Show bot version.||

## Administrator Commands

|Command|Description|Example|
|:--|:--|:--|
|`*start`|Forces the match to start.||
|`*skip`|Forces current host to skip.||
|`*order [players list]`| Reorders the queue in specified order. |`*order p1, p2, p3`|
|`*keep size [1-16]` | Keeps the size of the lobby at specified number. | `*keep size 8`|
|`*keep password [password]` | Keeps the lobby password. | `*keep password foobar`|
|`*keep mode [0-3] [0-3]` | Keeps the lobby team and score mode. | `*keep 0 0`, `*keep HeadToHead Combo` |
|`*keep mods [mod] ([mod]) ([mod]) ...` | Keeps the lobby allowed mods. | `*keep mods HR DT`|
|`*keep title [title]` | Keeps the lobby title. | `*keep title 0-2.99* Auto Host Rotate`|
|`*no keep size` | Stops keeping the size of the lobby at specified number. ||
|`*no keep password` | Stops keeping the lobby password. ||
|`*no keep mode` | Stops keeping the team and score mode. ||
|`*no keep mod` | Stops keeping the lobby allowed mods and set mod to FreeMod. ||
|`*no keep title` | Stops keeping the lobby title. ||
|`*regulation enable` | Enable Map Checker ||
|`*regulation disable` | Disable Map Checker. ||
|`*no regulation` | Disable Map Checker. ||
|`*regulation min_star [number]` | Changes the lower star cap. If set to 0, the cap will be removed. | `*regulation min_star 2`|
|`*regulation max_star [number]` | Changes the upper star cap. | `*regulation max_star 6`|
|`*regulation min_length [sec]` | Changes the minimum allowed map length. | `*regulation min_length 60`|
|`*regulation max_length [sec]` | Changes the maximum allowed map length. | `*regulation max_length 600`|
|`*regulation gamemode [osu\|taiko\|fruits\|mania]` | Changes the gamemode. | `*regulation gamemode osu`|
|`*regulation [name]=[value] [name]=[value]...` | Changes multiple settings. | `*regulation min_star=6.00 max_star=6.99 gameode=taiko`|
|`*regulation allow_convert` | Allows conversion of maps for alternate game modes. | `*regulation allow_convert`|
|`*regulation disallow_convert` | Disallows conversion of maps for alternate game modes. | `*regulation disallow_convert`|
|`*denylist add [username]` | Blacklists a player. | `*denylist add bad_guy` |
|`*denylist remove [username]` | Removes a player from blacklist. | `*denylist remove bad_guy` |

Note: Administrator commands are also available on the cli. Here are examples of Administrator commands using cli:

Cli

```text
#mp_123456 > *keep size 16
```

# Setup

1. Install Node.js and Git

+ [Node.js](https://nodejs.org/) (Version 16.11.1 or Higher)
+ [Git](https://git-scm.com/)

2. Clone this repo

```text
> git clone https://github.com/josephbinoy/jpn-autohost
> cd jpn-autohost
```
3. Install npm dependencies and typescript. Then compile.

```text
> npm install
> npm install typescript
> tsc
```

4. Create a file `./config/local.json`, use `./config/default.json` as template.
5. Get irc password from [osu! IRC Authentication](https://osu.ppy.sh/p/irc)
6. Enter your account ID and irc password to `./config/local.json` as in the following example.

```json
{
  "irc": {
    "server": "irc.ppy.sh",
    "nick": "[your account id]",
    "opt": {
      "port": 6667,
      "password": "[your account password]"
    }
  }
}
```

7. Configure the bot (Optional). See the [Configuration](#configuration) section for details.
8. Launch the bot

```text
> npm run start
starting up...
Connecting to Osu Bancho ...
Connected :D

=== Welcome to osu-ahr ===

MainMenu Commands
  [make <Lobby_name>] Make a lobby.  e.g. 'make 5* auto host rotation'
  [enter <LobbyID>]   Enter the lobby. e.g. 'enter 123456' (It only works if you are a referee in the lobby).
  [help] Show this message.
  [quit] Quit the application.

> make 5-6* | auto host rotation

# Configuration

You can edit local.json to configure the bot's behavior.
It is also possible to set values via environment variables. (.env files are also supported.)
The format of environment variable name is `ahr_[section_name]_[config_name]`.

## IRC Section

+ `server` : `string` Host name of osu! IRC server.
+ `nick` : `string` Your osu! account name
+ `opt.port` : `number`
+ `opt.password` : `string` Your IRC password. You can get it from [https://osu.ppy.sh/p/irc](https://osu.ppy.sh/p/irc).

local.json

```json
{
  "irc": {
    "server": "irc.ppy.sh",
    "nick": "meowhal",
    "opt": {
      "port": 6667,
      "password": "123456"
    }
  },
...
```

env

```bash
ahr_irc_server="irc.ppy.sh"
ahr_irc_nick=meowhal
ahr_irc_port=6667
ahr_irc_password=123456
```

## Lobby Section

+ `authorized_users` : `string[]`
  + Specify any authorized users. Authorized users can use *commands(*skip, *start,*order).
+ `listref_duration_ms` : `number`
  + Sets the time in milliseconds to wait for a response from BanchoBot when typing "!mp listref".
+ `info_message` : `string[]` The response message for !info or !help.
+ `info_message_cooltime_ms` : `number` Cool down period for !info command (milliseconds).
+ `stat_timeout_ms` : `number` Sets the time in milliseconds to wait for a response from BanchoBot when typing "!stats".
+ `info_message_announcement_interval_ms` : `number` Set above 180000 if you want to send info messages periodically.

local.json

```json
"Lobby": {
  "authorized_users": ["peppy", "abcedf"], 
  "listref_duration_ms": 1000,
  "info_message": [
    "welcome to ahr lobby!",
    "The second item is displayed on the second line.",
    "Too many lines will result in a silent penalty"
  ],
  "info_message_cooltime_ms": 60000,
  "stat_timeout_ms": 5000,
  "info_message_announcement_interval_ms": 0
}
```

env

```bash
ahr_Lobby_authorized_users='["peppy", "abcedf"]'
listref_duration_ms=1000
info_message='["welcome to ahr lobby!", "The second item is displayed on the second line.","Too many lines will result in a silent penalty"]'
```

## AfkKicker Section

Points are added to players who seem AFK. Any player with points totaling above the threshold will be kicked.

1. Finishes the match with no score -> add 2 points
2. Match starts when the player is missing the map -> add 2 points
3. !stat command shows the player as AFK -> add 3 points

+ `enabled` : `boolean`
+ `threshold` : `number`
+ `cooltime_ms` : `number`

```json
{
  ...
  "AfkKicker": {
    "enabled": true,
    "threshold": 6,
    "cooltime_ms": 30000
  },
  ...
}
```

## AutoHostSelector Section

+ `show_host_order_after_every_match` : `boolean` Sends a message containing the player queue after every match.
+ `host_order_chars_limit` : `number` Host-order messages are truncated to this length.
+ `host_order_cooltime_ms` : `number` Cooldown time between Host-order messages.
+ `deny_list` : `string[]` Players contained in this list are not added to the host queue.

## AutoStartTimer Section

The match start timer will automatically activate after the host selects a map.

+ `enabled` : `boolean` Set true if you want to start the timer automatically.
+ `doClearHost`: `boolean` Send '!mp clearhost' after the timer starts.
+ `waitingTime`: `number` Number of seconds for the timer.

## HistoryLoader Section

+ `fetch_interval_ms`: `number` Time period between fetching the match history

## HostSkipper Section

Configs related to host-skip vote and automatic AFK host skip.

+ `vote_rate` : `number(0.0 - 1.0)` Number of votes required to skip.
  + If there are 16 players and the rate is 0.5, 8 players need to vote.
+ `vote_min`: `number` Minimum required vote count .
+ `vote_cooltime_ms` : `number` Cooldown time for the next vote (avoids involving the next host).
+ `vote_msg_defer_ms` : `number` Cooldown time for vote progress message.
+ `afk_check_timeout_ms"` : `number` Waiting time for !stat command result.
+ `afk_check_interval_first_ms` : `number` Period before first AFK host check.
+ `afk_check_interval_ms` : `number` Interval period to check if the host is AFK.
+ `afk_check_do_skip` : `boolean` Automatically skips AFK hosts.

## LobbyKeeper Section

+ `mode` : `null | { "team": number, "score": number }` Keep lobby mode.
  + team  => 0: Head To Head, 1: Tag Coop, 2: Team Vs, 3: Tag Team Vs
  + score => 0: Score, 1: Accuracy, 2: Combo, 3: Score V2
+ `size` : `number` Keep lobby size.
+ `password`: `null | string` Keep password.
+ `mods` : `null | string` Keep mods.
+ `hostkick_tolerance`:`integer` Number of players kicked by the host before host is kicked for abuse.
+ `title` : `null | string` Keep the lobby title.

```json
{
 ...
 "LobbyKeeper": {
    "mode": {"team": 2, "score": 1 },
    "size": 16,
    "title": "4-5 auto host rotation"
  }
  ...
}
```

"LobbyKeeper": {
        "mode": {"team": 2, "score": 1 },
        "size": 13
    }

## LobbyTerminator Section

+ `terminate_time_ms` : `number` Period of time to wait before closing the lobby for inactivity.

## MapChecker Section

+ `enabled`: `boolean` Enable map checker.
+ `star_min`: `number` Change lower difficulty cap. 0 means no cap.
+ `star_max`: `number` Change lower difficulty cap. 0 means no cap.
+ `length_min`: `number` Change minimum allowed song length (seconds). 0 means no cap.
+ `length_max`: `number` Change maximum allowed song length (seconds). 0 means no cap.
+ `gamemode`: `string` Specify game mode in the room (osu, taiko, fruits, mania).
+ `num_violations_allowed`: `number` Number of times violations are allowed.  0 means unlimited.
+ `allow_convert`: `boolean` Allows conversion of maps for alternate game modes.

## MatchStarter Section

!start vote configs

+ `vote_rate` : `number(0.0 - 1.0)` Number of votes required to start.
+ `vote_min`: `number` Minimum required vote count.
+ `vote_msg_defer_ms` : `number` Cooldown time for vote progress message.
+ `start_when_all_player_ready` : `boolean` Starts the match when everyone is ready.

## MatchAborter Section

!abort vote and auto abort configs

+ `vote_rate` : `number(0.0 - 1.0)` Number of votes required to abort.
+ `vote_min`: `number` Minimum number of votes required to abort.
+ `vote_msg_defer_ms` : `number` Cooldown time for vote progress message.
+ `auto_abort_rate`: `integer` Number of players required to have finished before automatic match abortion.
+ `auto_abort_delay_ms`: `number` Number of milliseconds to wait before executing abort command.
+ `auto_abort_do_abort`: `boolean` Enable match abortion.

## WordCounter Section

Used to measure the amount of bot messages

## OahrCli Section

+ `invite_users` : `string[]` Players to be invited when the bot makes a new lobby.
+ `password` : `string` Default lobby password; empty("") if you don't need password.

## WebApi Section

+ `client_id`: `number`, WebApi client id. You can make client at [https://osu.ppy.sh/home/account/edit](https://osu.ppy.sh/home/account/edit)
  + Optional. The bot uses the WebApi instead of webpage to get the beatmap info.
+ `client_secret`: `string` WebApi client secret
+ `token_store_dir`: `string`, Don't care
+ `asGuest`: `true` Set true
+ `callback`: `string`,
+ `callback_port`: `number` ,

# Features

+ Making Lobby
+ Entering Lobby
+ IRC chat
+ Auto host rotation
+ Voting for skipping current host
+ Starting the match
+ Voting for abort the match
+ Closing the lobby

## Making Lobby

Issue the `!mp make` command to create a new lobby. Bot manages lobbies via IRC, but only lobbies where you are a referee can be communicated with via IRC.

## Entering Lobby

When you restart the bot, it will be able to re-enter the lobby it has already created. The bot will analyze the lobby history and try to restore the order of hosts.

## IRC Chat

You can send a chat message to the lobby from the console. Type `say` followed by the message you want to send.

```text
#mp_10000 > say hello guys!
```

## Auto Host Rotation

When a player enters a room, they are added to the end of the host queue.
The player at the front of the queue is the host.
If a player who has left the room re-enters, they will be added to the end of the queue.
The host queue is rotated immediately after the game starts, so players who join during the game will be added behind the current host.
If a host leaves the lobby after selecting a map, the next host can choose to start the game or re-select a map. If the new host starts the game, they will continue to be the host after the game.
To check the current queue, type `info` on the console screen.

```text
#mp_10000 > info
=== lobby status ===
  lobby id : 10000
  status : Entered
  players : 3, inGame : 0 (playing : 0)
  refs : xxxx
  host : player1, pending : null
-- AutoHostSelector --
  current host queue
    palyer1, player2, player3
...
```

## Voting for skipping current host

Typing !skip when you aren't host results in a vote. When half of the lobby has voted, the host will be forcibly skipped. The required percentage of votes can be changed in the config file.
If a host skips, it will immediately move to the next person.
Hosts that have been AFK can be skipped with this feature.

## Starting the match

The game will start automatically when everyone is in the ready state.
Please note that the game will not start automatically when everyone is ready as a result of a user leaving the game.
A player can vote for the start of the game with `!start`.
The host can start the start timer with `!start <time>`.

## Voting for abort the match

If the game starts and the message "waiting for players" is displayed and the game cannot proceed, the game may be aborted by voting with `!abort`.
If the abort is approved but the map has not been played, the host will not be changed. If the map is changed through the console, the host will be rotated.
If a player has finished the map, the game will behave as if it had ended normally.

## Closing the lobby

Lobbies created with `!mp make` will continue to exist until a certain amount of time has passed, even if there are no more players.
Since this is a long time, and may cause problems for other users, the lobby will be automatically be closed if no one is in it for a certain period of time.
If `close now` is issued in the console, the `!mp close` command will be sent and the lobby will be closed immediately.  
If a number of seconds is specified as an argument, such as `close 30`, the lobby will wait until a password is set and for everyone to leave, then the lobby will close after the specified number of seconds has passed.
If `close` is issued, the lobby will be closed after the password is set and everyone has left.

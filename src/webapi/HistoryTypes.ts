import { Covers } from './Beatmapsets';

export type History = {
  'match': Match,
  'events': Event[],
  'users': User[],
  'latest_event_id': number,
  'current_game_id': number | null
}

export type Match = {
  'id': number,
  'start_time': string,
  'end_time': string | null,
  'name': string
}

export type PromptScore = {
  'name': string,
  'score': number,
}

export type Event = {
  'id': number,
  'detail': {
    'type': EventType,
    'text'?: string
  },
  'game'?: Game,
  'timestamp': string,
  'user_id': number | null
}

export type EventType = 'match-created' | 'match-disbanded' |
  'host-changed' | 'player-joined' | 'player-left' | 'player-kicked' |
  'other';

export type User = {
  'avatar_url': string | null,
  'country_code': string,
  'default_group': string,
  'id': number,
  'is_active': boolean,
  'is_bot': boolean,
  'is_online': boolean,
  'is_supporter': boolean,
  'last_visit': string,
  'pm_friends_only': boolean,
  'profile_colour': string | null,
  'username': string,
  'country': {
    'code': string,
    'name': string
  }
}

export type Game = {
  'id': number
  'start_time': string,
  'end_time': string | null,
  'mode': 'osu' | 'taiko' | 'fruits' | 'mania' | string,
  /**
   * 0 = osu, 1 = taiko, 2 = fruits, 3 = mania
   */
  'mode_int': number,
  'scoring_type': 'score' | 'accuracy' | 'combo' | 'scorev2' | string,
  'team_type': 'head-to-head' | 'tag-coop' | 'team-vs' | 'tag-team-vs' | string,
  'mods': string[],
  'beatmap': any,
  'scores': Score[]
}

export type Score = {
  'id': null,
  'user_id': number,
  'accuracy': number,
  'mods': string[],
  'score': number,
  'mode' : string,
  'passed' : boolean,
  'mode_int': number,
  'max_combo': number,
  'perfect': number,
  'statistics': {
    'count_50': number,
    'count_100': number,
    'count_300': number,
    'count_geki': number,
    'count_katu': number,
    'count_miss': number
  },
  'rank': string,
  'replay' : boolean,
  'created_at': string,
  'type' : string,
  'best_id': null,

  'pp': null,
  'match': {
    'slot': number,
    'team': 'none' | 'red' | 'blue',
    'pass': boolean
  }
  'current_user_attributes' :{
  'pin' : null
  }
}

export type UserScore = {
  accuracy: number,
  best_id: number,
  created_at: string,
  id: number,
  max_combo: number,
  mode: string,
  mode_int: number,
  mods: string[],
  passed: boolean,
  perfect: boolean,
  pp: number | null,
  rank: string,
  replay: boolean,
  score: number,
  statistics: {
    count_100: number,
    count_300: number,
    count_50: number,
    count_geki: number | null,
    count_katu: number | null,
    count_miss: number
  },
  type: string,
  user_id: number,
  current_user_attributes: {
    pin: null
  },
  beatmap: {
    beatmapset_id: number,
    difficulty_rating: number,
    id: number,
    mode: string,
    status: string,
    total_length: number,
    user_id: number,
    version: string,
    accuracy: number,
    ar: number,
    bpm: number,
    convert: boolean,
    count_circles: number,
    count_sliders: number,
    count_spinners: number,
    cs: number,
    deleted_at: null | string,
    drain: number,
    hit_length: number,
    is_scoreable: boolean,
    last_updated: string,
    mode_int: number,
    passcount: number,
    playcount: number,
    ranked: number,
    url: string,
    checksum: string
  },
  beatmapset: {
    artist: string,
    artist_unicode: string,
    covers: Covers,
    creator: string,
    favourite_count: number,
    hype: null | string,
    id: number,
    nsfw: boolean,
    offset: number,
    play_count: number,
    preview_url: string,
    source: string,
    spotlight: boolean,
    status: string,
    title: string,
    title_unicode: string,
    track_id: number,
    user_id: number,
    video: boolean
  },
  user: {
    avatar_url: string,
    country_code: string,
    default_group: string,
    id: number,
    is_active: boolean,
    is_bot: boolean,
    is_deleted: boolean,
    is_online: boolean,
    is_supporter: boolean,
    last_visit: string,
    pm_friends_only: boolean,
    profile_colour: null | string,
    username: string
  },
  weight?: {
    percentage: number,
    pp: number
  }
};
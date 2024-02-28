import { PlayMode } from '../Modes';
import { Beatmap, Beatmapset as Beatmapset } from './Beatmapsets';
import { WebApiClient } from './WebApiClient';

export type BeatmapCache = Beatmap & { fetchedAt: number };

class BeatmapRepositoryClass {
  maps: Map<string, BeatmapCache>;
  cacheExpiredMs: number;

  constructor() {
    this.maps = new Map();
    this.cacheExpiredMs = 24 * 3600 * 1000;
  }

  /**
     *
     * @param mapId
     * @param mode
     * @param allowConvert
     * @returns
     * @throws FetchBeatmapError
     */
  async getBeatmap(mapId: number, mode: PlayMode = PlayMode.Osu, allowConvert: boolean = true): Promise<BeatmapCache> {
    let cache = this.tryGetCache(mapId, mode, allowConvert);
    if (cache) return cache;

    const set = await WebApiClient.getBeatmapset(mapId);
    if (set.availability.download_disabled || set.availability.more_information) {
      throw new FetchBeatmapError(FetchBeatmapErrorReason.NotAvailable);
    }
    this.cacheMaps(set);

    cache = this.tryGetCache(mapId, mode, allowConvert);
    if (cache) return cache;

    throw new FetchBeatmapError(FetchBeatmapErrorReason.PlayModeMismatched);
  }

  tryGetCache(mapId: number, mode: PlayMode = PlayMode.Osu, allowConvert: boolean = true): BeatmapCache | undefined {
    const mapKey = this.genKey(mapId, mode);
    const cache = this.maps.get(mapKey);

    if (cache) {
      if (Date.now() < cache.fetchedAt + this.cacheExpiredMs) {
        if (mode === PlayMode.Osu || allowConvert || !cache.convert) {
          return cache;
        }
      } else {
        this.maps.delete(mapKey);
      }
    }
  }

  cacheMaps(set: Beatmapset) {
    const now = Date.now();
    set.recent_favourites = [];
    for (const map of [...set.beatmaps ?? [], ...set.converts ?? []] as BeatmapCache[]) {
      const key = this.genKey(map.id, map.mode);
      map.fetchedAt = now;
      map.beatmapset = set;
      map.failtimes = { exit: [], fail: [] };
      this.maps.set(key, map);
    }
  }

  discardExpiredCache(expiredMs: number = this.cacheExpiredMs) {
    const now = Date.now();
    for (const [key, cache] of this.maps.entries()) {
      if (now > cache.fetchedAt + expiredMs) {
        this.maps.delete(key);
      }
    }
  }

  genKey(mapid: number, mode: string | PlayMode) {
    if (typeof mode === 'string') {
      mode = PlayMode.from(mode);
    }
    return `${mode.id}.${mapid}`;
  }
}

export enum FetchBeatmapErrorReason {
    NotFound,
    FormatError,
    PlayModeMismatched,
    Unknown,
    NotAvailable
}

export function isFetchBeatmapError(err: any): err is FetchBeatmapError {
  return 'isFetchBeatmapError' in err;
}

export class FetchBeatmapError extends Error {
  isFetchBeatmapError: true = true;
  reason: FetchBeatmapErrorReason;
  constructor(reason: FetchBeatmapErrorReason, message?: string) {
    super(message ?? FetchBeatmapErrorReason[reason]);
    this.reason = reason;
    this.name = 'FetchBeatmapError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FetchBeatmapError);
    }
  }
}

export const BeatmapRepository = new BeatmapRepositoryClass();

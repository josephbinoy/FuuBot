import { Database } from 'sqlite';
import { WebApiClient } from '../webapi/WebApiClient';
import axios from 'axios';
export interface PickEntry {
    beatmapId: number;
    pickerId: number;
    pickDate: number;
  }
export interface MapCount {
    weeklyCount: number,
    monthlyCount :number,
    yearlyCount :number,
    alltimeCount :number
}

export async function getCount(db: Database, beatmapId: number): Promise<number> {
    let result;
    try{
        result = await db.get('SELECT COUNT(*) AS count FROM PICKS WHERE BEATMAP_ID = ?', [beatmapId]);
    }
    catch (error){
        return 0;
    }
    return result.count;
}

export async function getAllCounts(db: Database, beatmapId: number): Promise<MapCount> {
    let result: MapCount = {
        weeklyCount: 0,
        monthlyCount: 0,
        yearlyCount: 0,
        alltimeCount: 0
    };
    const query = `
        SELECT
        COUNT(*) AS total_count,
        SUM(CASE WHEN pick_date >= (strftime('%s', 'now') - 7 * 86400) THEN 1 ELSE 0 END) AS weekly_count,
        SUM(CASE WHEN pick_date >= (strftime('%s', 'now') - 30 * 86400) THEN 1 ELSE 0 END) AS monthly_count,
        SUM(CASE WHEN pick_date >= (strftime('%s', 'now') - 365 * 86400) THEN 1 ELSE 0 END) AS yearly_count
        FROM picks
        WHERE BEATMAP_ID = ?;
    `;
    try {
        const res = await db.get(query, [beatmapId]);
        if (res) {
            result.weeklyCount=res.weekly_count ?? 0,
            result.monthlyCount=res.monthly_count ?? 0,
            result.yearlyCount=res.yearly_count ?? 0,
            result.alltimeCount=res.total_count ?? 0 
        } 
        return result;
    } 
    catch (error){
        return result;
    }
}

export async function insertPicks(db: Database, picksBuffer: Map<string, PickEntry>): Promise<void> {
    if(picksBuffer.size === 0) return;
    try{
        let sqlCommand = 'BEGIN TRANSACTION; ';
        picksBuffer.forEach(entry => {
            sqlCommand += `INSERT INTO PICKS VALUES (${entry.beatmapId}, ${entry.pickerId}, ${entry.pickDate}) ON CONFLICT(BEATMAP_ID, PICKER_ID) DO UPDATE SET PICK_DATE = excluded.PICK_DATE; `;
        });
        sqlCommand += 'COMMIT;';

        await db.exec(sqlCommand);
    } catch (error) {
        await db.exec('ROLLBACK');
        throw new Error(`Error writing to database: ${error}`);
    }
}

export async function deleteOldPicks(db: Database, time: string): Promise<void> {
    const timeFormat = /^\d+\s(minutes|hours|days|months|years|seconds)$/;

    if (!timeFormat.test(time)) {
        throw new Error("Invalid time format. Use the format 'NNN minutes', 'NNN hours', 'NNN days', 'NNN months', 'NNN years', or 'NNN seconds'.");
    }
    const deleteQuery = `BEGIN TRANSACTION; DELETE FROM PICKS WHERE PICK_DATE < strftime('%s', 'now', '-${time}'); COMMIT;`;
    try {
        await db.exec(deleteQuery);
    } catch (error) {
        await db.exec('ROLLBACK');
        throw new Error(`Error deleting old picks: ${error}`);
    }
}

export async function hasPlayerPickedMap(dbClient: Database, beatmapId: number, pickerId: number): Promise<boolean> {
    let result;
    const query = 'SELECT COUNT(*) AS count FROM PICKS WHERE BEATMAP_ID = ? AND PICKER_ID = ?';
    try{
        result = await dbClient.get(query, [beatmapId, pickerId]);
    }
    catch (error){
        return false
    }
    return result.count > 0;
}

export async function getMapStats(db: Database, beatmapId: number): Promise<string | null>{
    try{
        const query = `
        SELECT PICKER_ID, PICK_DATE
        FROM PICKS
        WHERE BEATMAP_ID = ?
        ORDER BY PICK_DATE DESC
        LIMIT 1;
      `;
      const result = await db.get(query, [beatmapId]);
      if(!result) return null;
      let name = "";
      if (result.PICKER_ID == 0) 
        name = "anonymous";
      else{
        const user = await WebApiClient.getUser(result.PICKER_ID);
        if (user)
            name = user.username;
        else
            name = "anonymous";
      }
      const pickDate = new Date(result.PICK_DATE * 1000);
      const msMsg = `Previously picked by [https://osu.ppy.sh/users/${result.PICKER_ID} ${name}] ${timeAgo(pickDate.toISOString())}`;
      return msMsg;
    } catch (error) {
        return "";
    }
}

export function timeAgo(createdAt: string): string {
    const createdDate = new Date(createdAt);
    const now = Date.now();
    const diffInMs = now - createdDate.getTime();

    const seconds = Math.floor(diffInMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return `${years} year${years == 1 ? '' : 's'} ago`;
    } else if (months > 0) {
        return `${months} month${months == 1 ? '' : 's'} ago`;
    } else if (days > 0) {
        return `${days} day${days == 1 ? '' : 's'} ago`;
    } else if (hours > 0) {
        return `${hours} hour${hours == 1 ? '' : 's'} ago`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes == 1 ? '' : 's'} ago`;
    } else {
        return `${seconds} second${seconds == 1 ? '' : 's'} ago`;
    }
}

export async function notifyFuuBotWebServer(picks: PickEntry[]): Promise<void> {
    try {
        await axios.post(`http://localhost:${process.env.FUUBOT_WEB_SERVER_PORT}/api/update`, { picks });
    } catch (error) {
        console.log('Error notifying web server:'+error);
    }
}

export async function getLimits(): Promise<MapCount> {
    let limits: MapCount = {
        weeklyCount: 999,
        monthlyCount: 999,
        yearlyCount: 999,
        alltimeCount: 999
    }
    try {
        const response = await axios.get(`http://localhost:${process.env.FUUBOT_WEB_SERVER_PORT}/api/limits`);
        if (response.data) {
            limits.weeklyCount = response.data.weeklyLimit;
            limits.monthlyCount = response.data.monthlyLimit;
            limits.yearlyCount = response.data.yearlyLimit;
            limits.alltimeCount = response.data.alltimeLimit;
        }
    } catch (error) {
        console.log('Error fetching limits from web server:', error);
    }
    return limits;
}
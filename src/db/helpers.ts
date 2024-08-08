import { Database } from 'sqlite';
import { WebApiClient } from '../webapi/WebApiClient';
export interface PickEntry {
    beatmapId: number;
    pickerId: number;
    pickDate: number;
  }

export async function getCount(db: Database, beatmapId: number): Promise<number> {
    let result;
    try{
        result = await db.get('SELECT COUNT(BEATMAP_ID) AS count FROM PICKS WHERE BEATMAP_ID = ?', [beatmapId]);
    }
    catch (error){
        return 0;
    }
    return result.count;
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
        return `${years} years ago`;
    } else if (months > 0) {
        return `${months} months ago`;
    } else if (days > 0) {
        return `${days} days ago`;
    } else if (hours > 0) {
        return `${hours} hours ago`;
    } else if (minutes > 0) {
        return `${minutes} minutes ago`;
    } else {
        return `${seconds} seconds ago`;
    }
}


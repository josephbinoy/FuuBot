import { Database } from 'sqlite';

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

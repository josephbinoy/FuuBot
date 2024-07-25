import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

export default async function setupDatabase(path: string): Promise<Database | null> {
    try{
        let db: Database = await open({
            filename: path,
            driver: sqlite3.Database
        });

        // set the journal_mode to WAL for better concurrency cuz we wanna run multiple bots simultaneously
        await db.exec('PRAGMA journal_mode = WAL;');
        await initializeTables(db);
        return db;
    } catch (error) {
        return null;
    };
}

async function initializeTables(db: Database) {
    if (!db) {
        throw new Error('Database connection is not initialized.');
    }
    
    await db.run(`
        CREATE TABLE IF NOT EXISTS PICKS (
            BEATMAP_ID INTEGER,
            PICKER_ID INTEGER,
            PICK_DATE INTEGER,
            PRIMARY KEY (BEATMAP_ID, PICKER_ID)
        );
    `);

    await db.run(`
        CREATE INDEX IF NOT EXISTS idx_beatmap_id
        ON PICKS (BEATMAP_ID);
    `);

    await db.run(`
        CREATE INDEX IF NOT EXISTS idx_pick_date
        ON PICKS (PICK_DATE);
    `);

    await db.run(`
        CREATE INDEX IF NOT EXISTS idx_beatmap_picker 
        ON PICKS(BEATMAP_ID, PICKER_ID);
    `);    
}

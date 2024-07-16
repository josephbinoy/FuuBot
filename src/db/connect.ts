import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

export default async function setupDatabase(): Promise<Database> {
    let db: Database = await open({
        filename: './data/database/overplayed.db',
        driver: sqlite3.Database
    });

    // Set the journal_mode to WAL for better concurrency because we running multiple bots
    await db.exec('PRAGMA journal_mode = WAL;');

    await initializeTables(db);

    return db;
}

async function initializeTables(db: Database) {
    if (!db) {
        throw new Error('Database connection is not initialized.');
    }

    await db.exec(`
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY,
            name TEXT
        )
    `);

    await db.exec(`
        CREATE TABLE IF NOT EXISTS beatmaps (
            id INTEGER,
            name TEXT,
            player_id INTEGER,
            date_picked INTEGER,
            PRIMARY KEY (id, player_id),
            FOREIGN KEY (player_id) REFERENCES players(id)
        )
    `);
}

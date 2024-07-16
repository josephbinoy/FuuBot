import { Database } from 'sqlite';

export async function insertPlayer(db: Database, id:number, name: string): Promise<void> {
    await db.run('INSERT INTO players (id, name) VALUES (?, ?)', [id, name]);
}

export async function insertBeatmap(db: Database, id: number, name: string, date_picked: string, player_id: number): Promise<void> {
    await db.run(`
        INSERT INTO beatmaps (id, name, player_id, date_picked)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id, player_id)
        DO UPDATE SET date_picked = excluded.date_picked
    `, [id, name, player_id, date_picked]);
}


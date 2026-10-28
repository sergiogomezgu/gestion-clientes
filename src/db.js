import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const schemaPath = new URL('./schema.sql', import.meta.url);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

export async function initializeDatabase() {
  const schema = await readFile(fileURLToPath(schemaPath), 'utf8');
  await pool.query(schema);
}
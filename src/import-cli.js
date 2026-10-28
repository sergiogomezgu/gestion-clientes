import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool, initializeDatabase } from './db.js';
import { importCsv } from './import.js';

async function main() {
  const filePath = resolve(process.argv[2] ?? 'data/clientes_antiguos.csv');
  await initializeDatabase();
  const summary = await importCsv(pool, filePath);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error('No se pudo completar la importacion:', error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
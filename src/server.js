import { createApp } from './app.js';
import { initializeDatabase, pool } from './db.js';

async function main() {
  const apiToken = process.env.API_TOKEN;
  if (!apiToken || apiToken.length < 32) {
    throw new Error('API_TOKEN debe tener al menos 32 caracteres.');
  }

  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un numero entre 1 y 65535.');
  }

  await initializeDatabase();
  const app = createApp(pool, apiToken);
  const server = app.listen(port, '0.0.0.0', () => {
    console.info(`Aplicacion disponible en el puerto ${port}.`);
  });

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error('No se pudo cerrar el servidor correctamente:', error);
        process.exitCode = 1;
      }
      pool.end().catch((poolError) => {
        console.error('No se pudo cerrar la conexion a PostgreSQL:', poolError);
        process.exitCode = 1;
      });
    });
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('No se pudo iniciar la aplicacion:', error.message);
  pool.end().finally(() => {
    process.exitCode = 1;
  });
});

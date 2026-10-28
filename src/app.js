import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { AppError } from './errors.js';
import {
  addContact,
  archiveClient,
  createClient,
  deleteContact,
  getClient,
  getClientHistory,
  listClients,
  updateClient,
  updateContact
} from './repository.js';
import {
  getActor,
  parsePositiveInteger,
  validateClientInput,
  validateContactInput
} from './validation.js';

function requireApiToken(expectedToken) {
  const expected = Buffer.from(expectedToken);
  return (request, response, next) => {
    const authorization = request.get('authorization') ?? '';
    const match = /^Bearer (.+)$/.exec(authorization);
    if (!match) {
      response.status(401).json({ error: 'Se requiere un token de acceso.' });
      return;
    }

    const received = Buffer.from(match[1]);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      response.status(401).json({ error: 'Token de acceso no valido.' });
      return;
    }
    next();
  };
}

function parsePage(value, fallback, name, maximum) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = parsePositiveInteger(value, name);
  if (parsed > maximum) {
    throw new AppError(400, `${name} no puede superar ${maximum}.`);
  }
  return parsed;
}

export function createApp(pool, apiToken) {
  const app = express();

  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    response.set('X-Content-Type-Options', 'nosniff');
    response.set('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', async (_request, response) => {
    await pool.query('SELECT 1');
    response.json({ status: 'ok' });
  });
  app.use('/api', requireApiToken(apiToken));

  app.get('/api/clientes', async (request, response) => {
    const query = request.query;
    const filters = {
      q: typeof query.q === 'string' ? query.q.trim() : '',
      status: typeof query.estado === 'string' ? query.estado.trim() : '',
      country: typeof query.pais === 'string' ? query.pais.trim() : '',
      commercial: typeof query.comercial === 'string' ? query.comercial.trim() : '',
      page: parsePage(query.page, 1, 'page', 1_000_000),
      limit: parsePage(query.limit, 10, 'limit', 100)
    };

    if (filters.q.length > 120 || filters.country.length > 100 || filters.commercial.length > 120) {
      throw new AppError(400, 'Uno de los filtros supera la longitud permitida.');
    }
    if (filters.status && !['Activo', 'Inactivo'].includes(filters.status)) {
      throw new AppError(400, 'El filtro estado debe ser Activo o Inactivo.');
    }
    response.json(await listClients(pool, filters));
  });

  app.get('/api/clientes/:id/historico', async (request, response) => {
    const id = parsePositiveInteger(request.params.id, 'id');
    response.json(await getClientHistory(pool, id));
  });

  app.post('/api/clientes/:id/contactos', async (request, response) => {
    const clientId = parsePositiveInteger(request.params.id, 'id');
    const contact = validateContactInput(request.body);
    response.status(201).json(await addContact(pool, clientId, contact, getActor(request)));
  });

  app.put('/api/contactos/:id', async (request, response) => {
    const id = parsePositiveInteger(request.params.id, 'id');
    const contact = validateContactInput(request.body, { partial: true });
    response.json(await updateContact(pool, id, contact, getActor(request)));
  });

  app.delete('/api/contactos/:id', async (request, response) => {
    const id = parsePositiveInteger(request.params.id, 'id');
    response.json(await deleteContact(pool, id, getActor(request)));
  });

  app.get('/api/clientes/:id', async (request, response) => {
    const id = parsePositiveInteger(request.params.id, 'id');
    response.json(await getClient(pool, id));
  });

  app.post('/api/clientes', async (request, response) => {
    const client = validateClientInput(request.body);
    response.status(201).json(await createClient(pool, client, getActor(request)));
  });

  app.put('/api/clientes/:id', async (request, response) => {
    const id = parsePositiveInteger(request.params.id, 'id');
    const client = validateClientInput(request.body, { partial: true });
    response.json(await updateClient(pool, id, client, getActor(request)));
  });

  app.delete('/api/clientes/:id', async (request, response) => {
    const id = parsePositiveInteger(request.params.id, 'id');
    response.json(await archiveClient(pool, id, getActor(request)));
  });

  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  app.use('/api', (_request, _response, next) => {
    next(new AppError(404, 'La ruta de la API no existe.'));
  });
  app.use((error, _request, response, _next) => {
    if (error instanceof AppError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'El cuerpo JSON no es valido.' });
      return;
    }
    if (error.type === 'entity.too.large') {
      response.status(413).json({ error: 'El cuerpo supera el tamano permitido.' });
      return;
    }

    console.error('Error al procesar la peticion:', error);
    response.status(500).json({ error: 'Se ha producido un error interno.' });
  });

  return app;
}

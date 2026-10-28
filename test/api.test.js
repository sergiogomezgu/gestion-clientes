import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';

const API_TOKEN = 'test-token-with-more-than-32-characters';

async function startTestServer() {
  const pool = {
    async query(sql) {
      if (sql.includes('COUNT(*)::int AS total')) {
        return { rows: [{ total: 0 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }
  };
  const server = createApp(pool, API_TOKEN).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test('protects customer data routes with the bearer token', async (context) => {
  const { server, baseUrl } = await startTestServer();
  context.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Gestión de clientes/);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);

  const withoutToken = await fetch(`${baseUrl}/api/clientes`);
  assert.equal(withoutToken.status, 401);

  const wrongToken = await fetch(`${baseUrl}/api/clientes`, {
    headers: { Authorization: 'Bearer incorrect-token' }
  });
  assert.equal(wrongToken.status, 401);

  const authorized = await fetch(`${baseUrl}/api/clientes`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` }
  });
  assert.equal(authorized.status, 200);
  assert.deepEqual((await authorized.json()).data, []);

  const invalidCreate = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ company: ' ' })
  });
  assert.equal(invalidCreate.status, 400);

  const missingCif = await fetch(`${baseUrl}/api/clientes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ company: 'Empresa sin CIF' })
  });
  assert.equal(missingCif.status, 400);
});

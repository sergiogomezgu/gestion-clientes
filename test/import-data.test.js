import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  normalizeCif,
  normalizeCompanyName,
  parseLegacyAmount,
  parseLegacyDate,
  parseLegacyRate
} from '../src/format.js';
import { insertImportedInvoice } from '../src/repository.js';

const csvPath = fileURLToPath(new URL('../data/clientes_antiguos.csv', import.meta.url));

test('the supplied CSV can be normalized without importing invalid invoices', async () => {
  const content = await readFile(csvPath, 'utf8');
  const rows = parse(content, {
    bom: true,
    columns: true,
    delimiter: ';',
    skip_empty_lines: true
  });

  const invoiceRows = rows.filter((row) => row.factura.trim());
  const validInvoices = invoiceRows.filter((row) => (
    parseLegacyDate(row.fecha_factura)
    && parseLegacyAmount(row.base_imponible) !== null
    && parseLegacyRate(row.iva) !== null
  ));
  const uniqueInvoiceNumbers = new Set(validInvoices.map((row) => row.factura));

  assert.equal(rows.length, 18);
  assert.equal(invoiceRows.length, 17);
  assert.equal(validInvoices.length, 15);
  assert.equal(uniqueInvoiceNumbers.size, 14);
  assert.equal(parseLegacyDate('31/09/2026'), null);
  assert.equal(parseLegacyAmount(''), null);

  const clientsByCif = new Set(
    rows.map((row) => normalizeCif(row.cif)).filter(Boolean)
  );
  assert.equal(clientsByCif.size, 7);
  const missingCifRows = rows.filter((row) => !normalizeCif(row.cif));
  assert.equal(missingCifRows.length, 1);
  assert.equal(
    normalizeCompanyName(missingCifRows[0].empresa),
    normalizeCompanyName('Hotel Mar Blau SA')
  );
  assert.equal(
    normalizeCompanyName('Hotel Mar Blau SA'),
    normalizeCompanyName('Hotel Mar Blau')
  );
});

test('recognizes an existing PostgreSQL invoice as an exact duplicate', async () => {
  const invoice = {
    number: 'F-2026-0101',
    date: '2026-09-03',
    taxableBase: '1250.00',
    vatRate: '21.00'
  };
  let inserted = false;
  const connection = {
    async query(sql) {
      if (sql.startsWith('SELECT')) {
        return {
          rowCount: 1,
          rows: [{
            client_id: '7',
            invoice_date: '2026-09-03',
            taxable_base: '1250.00',
            vat_rate: '21.00'
          }]
        };
      }
      inserted = true;
      return { rowCount: 1, rows: [] };
    }
  };

  assert.equal(await insertImportedInvoice(connection, 7, invoice), 'duplicate');
  assert.equal(inserted, false);
});

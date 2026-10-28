import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import {
  normalizeStatus,
  parseLegacyAmount,
  parseLegacyDate,
  parseLegacyRate
} from './format.js';
import { importClientRow, insertImportedInvoice } from './repository.js';

const REQUIRED_COLUMNS = [
  'empresa',
  'cif',
  'contacto',
  'email',
  'telefono',
  'direccion',
  'cp',
  'ciudad',
  'pais',
  'comercial',
  'estado',
  'fecha_alta',
  'factura',
  'fecha_factura',
  'base_imponible',
  'iva'
];

export async function importCsv(pool, filePath) {
  const content = await readFile(filePath, 'utf8');
  const rows = parse(content, {
    bom: true,
    columns: true,
    delimiter: ';',
    skip_empty_lines: true,
    relax_column_count: false
  });

  const headers = Object.keys(rows[0] ?? {});
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length) {
    throw new Error(`Faltan columnas en el CSV: ${missingColumns.join(', ')}.`);
  }

  const summary = {
    rows: rows.length,
    clientsCreated: 0,
    invoicesCreated: 0,
    duplicateInvoices: 0,
    clientsMatchedWithoutCif: 0,
    warnings: []
  };

  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');

    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      if (!row.empresa?.trim()) {
        summary.warnings.push(`Fila ${line}: cliente no importado; falta la empresa.`);
        continue;
      }

      const status = row.estado?.trim() ? normalizeStatus(row.estado) : 'Activo';
      if (row.estado?.trim() && !status) {
        summary.warnings.push(
          `Fila ${line}: estado no valido; se conserva el cliente con estado Activo.`
        );
      }

      const registrationDate = parseLegacyDate(row.fecha_alta);
      if (row.fecha_alta?.trim() && !registrationDate) {
        summary.warnings.push(
          `Fila ${line}: fecha de alta no valida; se conserva el cliente sin esa fecha.`
        );
      }

      const {
        client,
        created,
        matchedWithoutCif,
        ambiguousNameMatch,
        missingCif
      } = await importClientRow(
        connection,
        {
          ...row,
          estado: status || 'Activo',
          registrationDate
        },
        'importacion CSV'
      );
      if (created) {
        summary.clientsCreated += 1;
      }
      if (matchedWithoutCif) {
        summary.clientsMatchedWithoutCif += 1;
        summary.warnings.push(
          `Fila ${line}: cliente asociado por nombre porque falta el CIF; revisa la identidad.`
        );
      }
      if (ambiguousNameMatch) {
        summary.warnings.push(
          `Fila ${line}: hay varios clientes con ese nombre y falta el CIF; se omite la fila para no asociar datos al cliente equivocado.`
        );
        continue;
      }
      if (missingCif) {
        summary.warnings.push(
          `Fila ${line}: cliente no importado; falta el CIF y no existe un cliente unico que pueda asociarse por nombre.`
        );
        continue;
      }

      const number = row.factura?.trim();
      if (!number) {
        if (row.fecha_factura || row.base_imponible || row.iva) {
          summary.warnings.push(`Fila ${line}: hay datos de factura, pero falta su numero.`);
        }
        continue;
      }

      const date = parseLegacyDate(row.fecha_factura);
      const taxableBase = parseLegacyAmount(row.base_imponible);
      const vatRate = parseLegacyRate(row.iva);
      if (!date || taxableBase === null || vatRate === null) {
        const missing = [];
        if (!date) missing.push('fecha');
        if (taxableBase === null) missing.push('base imponible');
        if (vatRate === null) missing.push('IVA');
        summary.warnings.push(
          `Fila ${line}: factura ${number} no importada; ${missing.join(', ')} invalido o vacio.`
        );
        continue;
      }

      const result = await insertImportedInvoice(connection, client.id, {
        number,
        date,
        taxableBase,
        vatRate
      });
      if (result === 'inserted') {
        summary.invoicesCreated += 1;
      } else if (result === 'duplicate') {
        summary.duplicateInvoices += 1;
      } else {
        summary.warnings.push(
          `Fila ${line}: factura ${number} ya existe con datos diferentes; se conserva la existente.`
        );
      }
    }

    await connection.query('COMMIT');
    return summary;
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}
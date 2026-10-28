import {
  makeIdentityKey,
  normalizeCompanyName,
  normalizeCif,
  normalizeCountry
} from './format.js';
import { AppError } from './errors.js';

const CLIENT_COLUMNS = {
  company: 'company',
  cif: 'cif',
  address: 'address',
  postalCode: 'postal_code',
  city: 'city',
  country: 'country',
  commercial: 'commercial',
  status: 'status',
  registeredAt: 'registered_at'
};

const CONTACT_COLUMNS = {
  name: 'name',
  email: 'email',
  phone: 'phone'
};

function toClientRecord(row) {
  return {
    id: row.id,
    company: row.company,
    cif: row.cif,
    address: row.address,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    commercial: row.commercial,
    status: row.status,
    registeredAt: row.registered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at
  };
}

async function writeHistory(client, {
  clientId,
  clientName,
  entityType = 'cliente',
  entityId = null,
  field,
  oldValue,
  newValue,
  actor
}) {
  await client.query(
    `INSERT INTO client_history
      (client_id, client_name, entity_type, entity_id, field, old_value, new_value, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      clientId,
      clientName,
      entityType,
      entityId,
      field,
      oldValue === undefined ? null : JSON.stringify(oldValue),
      newValue === undefined ? null : JSON.stringify(newValue),
      actor
    ]
  );
}

async function touchClient(connection, clientId) {
  await connection.query(
    'UPDATE clients SET updated_at = NOW() WHERE id = $1',
    [clientId]
  );
}

async function ensureUniqueNameWithoutCif(connection, companyKey, currentId = null) {
  const result = await connection.query(
    `SELECT id FROM clients
     WHERE company_key = $1 AND archived_at IS NULL
       AND ($2::bigint IS NULL OR id <> $2)
     LIMIT 1`,
    [companyKey, currentId]
  );
  if (result.rowCount) {
    throw new AppError(409, 'Ya existe un cliente con ese nombre normalizado; añade o revisa el CIF.');
  }
}

export async function listClients(pool, filters) {
  const conditions = ['c.archived_at IS NULL'];
  const values = [];
  const addValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (filters.q) {
    const search = addValue(`%${filters.q}%`);
    const normalizedCif = normalizeCif(filters.q);
    const cifSearch = normalizedCif
      ? `OR COALESCE(c.cif, '') ILIKE ${addValue(`%${normalizedCif}%`)}`
      : '';
    conditions.push(`(
      c.company ILIKE ${search}
      OR COALESCE(c.cif, '') ILIKE ${search}
      ${cifSearch}
      OR EXISTS (
        SELECT 1 FROM contacts sc
        WHERE sc.client_id = c.id
          AND (sc.name ILIKE ${search} OR COALESCE(sc.email, '') ILIKE ${search})
      )
    )`);
  }
  if (filters.status) {
    conditions.push(`c.status = ${addValue(filters.status)}`);
  }
  if (filters.country) {
    conditions.push(`c.country ILIKE ${addValue(filters.country)}`);
  }
  if (filters.commercial) {
    conditions.push(`c.commercial ILIKE ${addValue(filters.commercial)}`);
  }

  const where = conditions.join(' AND ');
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM clients c WHERE ${where}`,
    [...values]
  );

  const limitPlaceholder = addValue(filters.limit);
  const offsetPlaceholder = addValue((filters.page - 1) * filters.limit);
  const result = await pool.query(
    `SELECT
       c.id, c.company, c.cif, c.city, c.country, c.commercial, c.status, c.updated_at,
       COALESCE(i.invoice_count, 0)::int AS invoice_count,
       COALESCE(i.accumulated_base, 0)::text AS accumulated_base,
       COALESCE(ct.contact_names, ARRAY[]::text[]) AS contact_names
     FROM clients c
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS invoice_count, SUM(taxable_base) AS accumulated_base
       FROM invoices WHERE client_id = c.id
     ) i ON TRUE
     LEFT JOIN LATERAL (
       SELECT ARRAY_AGG(name ORDER BY name) AS contact_names
       FROM contacts WHERE client_id = c.id
     ) ct ON TRUE
     WHERE ${where}
     ORDER BY c.company ASC, c.id ASC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values
  );

  return {
    data: result.rows.map((row) => ({
      id: row.id,
      company: row.company,
      cif: row.cif,
      city: row.city,
      country: row.country,
      commercial: row.commercial,
      status: row.status,
      updatedAt: row.updated_at,
      invoiceCount: row.invoice_count,
      accumulatedBase: row.accumulated_base,
      contacts: row.contact_names
    })),
    page: filters.page,
    limit: filters.limit,
    total: countResult.rows[0].total
  };
}

export async function getClient(pool, id) {
  const clientResult = await pool.query(
    'SELECT * FROM clients WHERE id = $1 AND archived_at IS NULL',
    [id]
  );
  if (!clientResult.rowCount) {
    throw new AppError(404, 'No se ha encontrado el cliente.');
  }

  const [contactsResult, invoicesResult, totalsResult] = await Promise.all([
    pool.query(
      `SELECT id, name, email, phone, created_at, updated_at
       FROM contacts WHERE client_id = $1 ORDER BY name, id`,
      [id]
    ),
    pool.query(
      `SELECT id, invoice_number, invoice_date, taxable_base::text, vat_rate::text,
              ROUND(taxable_base * (1 + vat_rate / 100), 2)::text AS total
       FROM invoices WHERE client_id = $1 ORDER BY invoice_date DESC, invoice_number DESC`,
      [id]
    ),
    pool.query(
      `SELECT COALESCE(SUM(taxable_base), 0)::text AS accumulated_base,
              COALESCE(SUM(ROUND(taxable_base * (1 + vat_rate / 100), 2)), 0)::text
                AS accumulated_total
       FROM invoices WHERE client_id = $1`,
      [id]
    )
  ]);

  return {
    ...toClientRecord(clientResult.rows[0]),
    contacts: contactsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    invoices: invoicesResult.rows.map((row) => ({
      id: row.id,
      number: row.invoice_number,
      date: row.invoice_date,
      taxableBase: row.taxable_base,
      vatRate: row.vat_rate,
      total: row.total
    })),
    accumulatedBase: totalsResult.rows[0].accumulated_base,
    accumulatedTotal: totalsResult.rows[0].accumulated_total
  };
}

export async function createClient(pool, input, actor) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const normalizedCif = normalizeCif(input.cif);
    if (!normalizedCif) {
      await ensureUniqueNameWithoutCif(connection, normalizeCompanyName(input.company));
    }
    const identityKey = makeIdentityKey(input.company, input.cif);
    const inserted = await connection.query(
      `INSERT INTO clients
        (identity_key, company_key, company, cif, address, postal_code, city, country,
         commercial, status, registered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'Activo'), $11)
       RETURNING *`,
      [
        identityKey,
        normalizeCompanyName(input.company),
        input.company,
        normalizedCif || null,
        input.address,
        input.postalCode,
        input.city,
        input.country,
        input.commercial,
        input.status,
        input.registeredAt
      ]
    );
    const created = inserted.rows[0];
    await writeHistory(connection, {
      clientId: created.id,
      clientName: created.company,
      field: 'cliente',
      newValue: toClientRecord(created),
      actor
    });

    const contacts = [];
    for (const contact of input.contacts ?? []) {
      contacts.push(await createContactRecord(connection, created, contact, actor));
    }

    await connection.query('COMMIT');
    return { ...toClientRecord(created), contacts };
  } catch (error) {
    await connection.query('ROLLBACK');
    if (error.code === '23505') {
      throw new AppError(409, 'Ya existe un cliente o contacto con esos datos.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateClient(pool, id, input, actor) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const found = await connection.query(
      'SELECT * FROM clients WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [id]
    );
    if (!found.rowCount) {
      throw new AppError(404, 'No se ha encontrado el cliente.');
    }

    const previous = found.rows[0];
    const fields = Object.keys(input);
    const nextCompany = input.company ?? previous.company;
    const nextCif = Object.hasOwn(input, 'cif')
      ? normalizeCif(input.cif) || null
      : previous.cif;
    if (!nextCif && (fields.includes('company') || fields.includes('cif'))) {
      await ensureUniqueNameWithoutCif(
        connection,
        normalizeCompanyName(nextCompany),
        id
      );
    }
    const updatedValues = fields.map((field) => (
      field === 'cif' ? normalizeCif(input[field]) || null : input[field]
    ));
    const assignments = fields.map(
      (field, index) => `${CLIENT_COLUMNS[field]} = $${index + 2}`
    );

    if (fields.includes('company')) {
      assignments.push(`company_key = $${fields.length + 2}`);
      updatedValues.push(normalizeCompanyName(input.company));
    }
    if (fields.includes('company') || fields.includes('cif')) {
      assignments.push(`identity_key = $${updatedValues.length + 2}`);
      updatedValues.push(makeIdentityKey(nextCompany, nextCif));
    }
    assignments.push('updated_at = NOW()');

    const updated = await connection.query(
      `UPDATE clients SET ${assignments.join(', ')}
       WHERE id = $1 RETURNING *`,
      [id, ...updatedValues]
    );
    const current = updated.rows[0];

    for (const field of fields) {
      const column = CLIENT_COLUMNS[field];
      const oldValue = previous[column];
      const newValue = current[column];
      if (String(oldValue ?? '') !== String(newValue ?? '')) {
        await writeHistory(connection, {
          clientId: id,
          clientName: current.company,
          field,
          oldValue,
          newValue,
          actor
        });
      }
    }

    await connection.query('COMMIT');
    return toClientRecord(current);
  } catch (error) {
    await connection.query('ROLLBACK');
    if (error.code === '23505') {
      throw new AppError(409, 'Ya existe un cliente con ese CIF.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function archiveClient(pool, id, actor) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const found = await connection.query(
      'SELECT * FROM clients WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [id]
    );
    if (!found.rowCount) {
      throw new AppError(404, 'No se ha encontrado el cliente.');
    }

    const previous = found.rows[0];
    const archived = await connection.query(
      `UPDATE clients SET archived_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    await writeHistory(connection, {
      clientId: id,
      clientName: previous.company,
      field: 'archivedAt',
      oldValue: previous.archived_at,
      newValue: archived.rows[0].archived_at,
      actor
    });

    await connection.query('COMMIT');
    return { id: previous.id, archived: true };
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}

async function createContactRecord(connection, client, input, actor) {
  const inserted = await connection.query(
    `INSERT INTO contacts (client_id, name, email, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, phone, created_at, updated_at`,
    [client.id, input.name, input.email, input.phone]
  );
  const contact = inserted.rows[0];
  await writeHistory(connection, {
    clientId: client.id,
    clientName: client.company,
    entityType: 'contacto',
    entityId: contact.id,
    field: 'contacto',
    newValue: { name: contact.name, email: contact.email, phone: contact.phone },
    actor
  });
  await touchClient(connection, client.id);
  return {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    createdAt: contact.created_at,
    updatedAt: contact.updated_at
  };
}

export async function addContact(pool, clientId, input, actor) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const clientResult = await connection.query(
      'SELECT id, company FROM clients WHERE id = $1 AND archived_at IS NULL FOR UPDATE',
      [clientId]
    );
    if (!clientResult.rowCount) {
      throw new AppError(404, 'No se ha encontrado el cliente.');
    }
    const contact = await createContactRecord(connection, clientResult.rows[0], input, actor);
    await connection.query('COMMIT');
    return contact;
  } catch (error) {
    await connection.query('ROLLBACK');
    if (error.code === '23505') {
      throw new AppError(409, 'Este email ya esta asociado a un contacto del cliente.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function updateContact(pool, id, input, actor) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const found = await connection.query(
      `SELECT ct.*, c.company
       FROM contacts ct
       JOIN clients c ON c.id = ct.client_id
       WHERE ct.id = $1 AND c.archived_at IS NULL
       FOR UPDATE OF ct`,
      [id]
    );
    if (!found.rowCount) {
      throw new AppError(404, 'No se ha encontrado el contacto.');
    }

    const previous = found.rows[0];
    const fields = Object.keys(input);
    const assignments = fields.map(
      (field, index) => `${CONTACT_COLUMNS[field]} = $${index + 2}`
    );
    assignments.push('updated_at = NOW()');
    const updated = await connection.query(
      `UPDATE contacts SET ${assignments.join(', ')}
       WHERE id = $1 RETURNING *`,
      [id, ...fields.map((field) => input[field])]
    );
    const current = updated.rows[0];

    for (const field of fields) {
      if (String(previous[field] ?? '') !== String(current[field] ?? '')) {
        await writeHistory(connection, {
          clientId: previous.client_id,
          clientName: previous.company,
          entityType: 'contacto',
          entityId: id,
          field,
          oldValue: previous[field],
          newValue: current[field],
          actor
        });
      }
    }

    await touchClient(connection, previous.client_id);
    await connection.query('COMMIT');
    return {
      id: current.id,
      name: current.name,
      email: current.email,
      phone: current.phone,
      createdAt: current.created_at,
      updatedAt: current.updated_at
    };
  } catch (error) {
    await connection.query('ROLLBACK');
    if (error.code === '23505') {
      throw new AppError(409, 'Este email ya esta asociado a un contacto del cliente.');
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function deleteContact(pool, id, actor) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    const found = await connection.query(
      `SELECT ct.*, c.company
       FROM contacts ct
       JOIN clients c ON c.id = ct.client_id
       WHERE ct.id = $1 AND c.archived_at IS NULL
       FOR UPDATE OF ct`,
      [id]
    );
    if (!found.rowCount) {
      throw new AppError(404, 'No se ha encontrado el contacto.');
    }
    const contact = found.rows[0];
    await writeHistory(connection, {
      clientId: contact.client_id,
      clientName: contact.company,
      entityType: 'contacto',
      entityId: contact.id,
      field: 'eliminado',
      oldValue: { name: contact.name, email: contact.email, phone: contact.phone },
      actor
    });
    await connection.query('DELETE FROM contacts WHERE id = $1', [id]);
    await touchClient(connection, contact.client_id);
    await connection.query('COMMIT');
    return { id: contact.id, deleted: true };
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    connection.release();
  }
}

export async function getClientHistory(pool, id) {
  const result = await pool.query(
    `SELECT id, client_id, client_name, entity_type, entity_id, field,
            old_value, new_value, changed_by, changed_at
     FROM client_history
     WHERE client_id = $1
     ORDER BY changed_at DESC, id DESC
     LIMIT 200`,
    [id]
  );
  return result.rows.map((row) => ({
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    entityType: row.entity_type,
    entityId: row.entity_id,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    changedBy: row.changed_by,
    changedAt: row.changed_at
  }));
}

export async function importClientRow(connection, row, actor) {
  const company = row.empresa?.trim();
  const cif = normalizeCif(row.cif);
  const companyKey = normalizeCompanyName(company);
  const registrationDate = row.registrationDate ?? null;
  let existing;

  if (cif) {
    const result = await connection.query(
      'SELECT * FROM clients WHERE identity_key = $1 FOR UPDATE',
      [`cif:${cif}`]
    );
    existing = result.rows[0];
  } else {
    const result = await connection.query(
      `SELECT * FROM clients
       WHERE company_key = $1 AND archived_at IS NULL
       ORDER BY id FOR UPDATE`,
      [companyKey]
    );
    if (result.rowCount === 1) {
      existing = result.rows[0];
    } else if (result.rowCount > 1) {
      return {
        client: null,
        created: false,
        matchedWithoutCif: false,
        ambiguousNameMatch: true
      };
    } else {
      return {
        client: null,
        created: false,
        matchedWithoutCif: false,
        ambiguousNameMatch: false,
        missingCif: true
      };
    }
  }

  const incoming = {
    company,
    company_key: companyKey,
    cif: cif || null,
    address: row.direccion?.trim() || null,
    postal_code: row.cp?.trim() || null,
    city: row.ciudad?.trim() || null,
    country: normalizeCountry(row.pais) || null,
    commercial: row.comercial?.trim() || null,
    status: row.estado?.trim() || 'Activo',
    registered_at: registrationDate
  };

  let client;
  let created = false;
  if (existing) {
    const assignments = [];
    const values = [existing.id];
    for (const [field, value] of Object.entries(incoming)) {
      if (field === 'company_key') {
        if (existing.company_key !== value) {
          values.push(value);
          assignments.push(`company_key = $${values.length}`);
        }
        continue;
      }
      if (value && String(existing[field] ?? '') !== String(value)) {
        values.push(value);
        assignments.push(`${field} = $${values.length}`);
        await writeHistory(connection, {
          clientId: existing.id,
          clientName: company,
          field: field === 'postal_code'
            ? 'postalCode'
            : field === 'registered_at' ? 'registeredAt' : field,
          oldValue: existing[field],
          newValue: value,
          actor
        });
      }
    }
    if (
      existing.identity_key.startsWith('name:')
      && (existing.company !== company || existing.cif !== incoming.cif)
    ) {
      const nextIdentityKey = makeIdentityKey(company, incoming.cif);
      if (existing.identity_key !== nextIdentityKey) {
        values.push(nextIdentityKey);
        assignments.push(`identity_key = $${values.length}`);
      }
    }
    if (assignments.length) {
      assignments.push('updated_at = NOW()');
      const updated = await connection.query(
        `UPDATE clients SET ${assignments.join(', ')} WHERE id = $1 RETURNING *`,
        values
      );
      client = updated.rows[0];
    } else {
      client = existing;
    }
  } else {
    const inserted = await connection.query(
      `INSERT INTO clients
        (identity_key, company_key, company, cif, address, postal_code, city, country,
         commercial, status, registered_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        cif ? `cif:${cif}` : `name:${companyKey}`,
        companyKey,
        incoming.company,
        incoming.cif,
        incoming.address,
        incoming.postal_code,
        incoming.city,
        incoming.country,
        incoming.commercial,
        incoming.status,
        incoming.registered_at
      ]
    );
    client = inserted.rows[0];
    created = true;
    await writeHistory(connection, {
      clientId: client.id,
      clientName: client.company,
      field: 'cliente',
      newValue: toClientRecord(client),
      actor
    });
  }

  const email = row.email?.trim().toLowerCase() || null;
  const contactName = row.contacto?.trim();
  if (contactName) {
    const existingContactResult = email
      ? await connection.query(
        'SELECT * FROM contacts WHERE client_id = $1 AND LOWER(email) = $2 FOR UPDATE',
        [client.id, email]
      )
      : await connection.query(
        `SELECT * FROM contacts
         WHERE client_id = $1 AND LOWER(name) = LOWER($2)
           AND COALESCE(phone, '') = COALESCE($3, '')
         FOR UPDATE`,
        [client.id, contactName, row.telefono?.trim() || null]
      );
    const contactNameValue = contactName;
    const phone = row.telefono?.trim() || null;

    if (existingContactResult.rowCount) {
      const contact = existingContactResult.rows[0];
      const contactChanges = [];
      const contactValues = [contact.id];
      for (const [field, value] of Object.entries({
        name: contactNameValue,
        email,
        phone
      })) {
        if (value && String(contact[field] ?? '') !== String(value)) {
          contactValues.push(value);
          contactChanges.push(`${field} = $${contactValues.length}`);
          await writeHistory(connection, {
            clientId: client.id,
            clientName: client.company,
            entityType: 'contacto',
            entityId: contact.id,
            field,
            oldValue: contact[field],
            newValue: value,
            actor
          });
        }
      }
      if (contactChanges.length) {
        contactChanges.push('updated_at = NOW()');
        await connection.query(
          `UPDATE contacts SET ${contactChanges.join(', ')} WHERE id = $1`,
          contactValues
        );
        await touchClient(connection, client.id);
      }
    } else {
      await createContactRecord(connection, client, {
        name: contactName,
        email,
        phone
      }, actor);
    }
  }

  return {
    client,
    created,
    matchedWithoutCif: !cif && Boolean(existing),
    ambiguousNameMatch: false
  };
}

export async function insertImportedInvoice(connection, clientId, invoice) {
  const existing = await connection.query(
    `SELECT client_id, invoice_date::text AS invoice_date,
            taxable_base::text, vat_rate::text
     FROM invoices WHERE invoice_number = $1`,
    [invoice.number]
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    const sameInvoice = String(row.client_id) === String(clientId)
      && row.invoice_date === invoice.date
      && row.taxable_base === invoice.taxableBase
      && row.vat_rate === invoice.vatRate;
    return sameInvoice ? 'duplicate' : 'conflict';
  }

  await connection.query(
    `INSERT INTO invoices (client_id, invoice_number, invoice_date, taxable_base, vat_rate)
     VALUES ($1, $2, $3, $4, $5)`,
    [clientId, invoice.number, invoice.date, invoice.taxableBase, invoice.vatRate]
  );
  await touchClient(connection, clientId);
  return 'inserted';
}
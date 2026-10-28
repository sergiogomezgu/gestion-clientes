import { AppError } from './errors.js';
import { parseLegacyDate } from './format.js';

const CLIENT_FIELDS = [
  'company',
  'cif',
  'address',
  'postalCode',
  'city',
  'country',
  'commercial',
  'status',
  'registeredAt'
];

const CONTACT_FIELDS = ['name', 'email', 'phone'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalText(value, field, maximumLength) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError(400, `${field} debe ser texto.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new AppError(400, `${field} supera el limite de ${maximumLength} caracteres.`);
  }
  return normalized || null;
}

export function validateClientInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'El cuerpo debe ser un objeto JSON.');
  }

  const values = {
    company: optionalText(body.company, 'La empresa', 160),
    cif: optionalText(body.cif, 'El CIF', 32),
    address: optionalText(body.address, 'La direccion', 200),
    postalCode: optionalText(body.postalCode, 'El codigo postal', 20),
    city: optionalText(body.city, 'La ciudad', 100),
    country: optionalText(body.country, 'El pais', 100),
    commercial: optionalText(body.commercial, 'El comercial', 120),
    status: optionalText(body.status, 'El estado', 20),
    registeredAt: optionalText(body.registeredAt, 'La fecha de alta', 10)
  };

  if (!partial && !values.company) {
    throw new AppError(400, 'La empresa es obligatoria.');
  }
  if ((!partial || Object.hasOwn(body, 'cif')) && !values.cif) {
    throw new AppError(400, 'El CIF es obligatorio.');
  }
  if (partial && Object.hasOwn(body, 'company') && !values.company) {
    throw new AppError(400, 'La empresa no puede quedar vacia.');
  }
  if (Object.hasOwn(body, 'status') && !values.status) {
    throw new AppError(400, 'El estado es obligatorio.');
  }
  if (Object.hasOwn(body, 'contacts') && partial) {
    throw new AppError(400, 'Gestiona los contactos desde sus rutas especificas.');
  }
  if (values.status && !['Activo', 'Inactivo'].includes(values.status)) {
    throw new AppError(400, 'El estado debe ser Activo o Inactivo.');
  }
  if (values.registeredAt) {
    const parsedDate = parseLegacyDate(values.registeredAt);
    if (!parsedDate || parsedDate !== values.registeredAt) {
      throw new AppError(400, 'La fecha de alta debe tener el formato AAAA-MM-DD.');
    }
    values.registeredAt = parsedDate;
  }

  const result = {};
  for (const field of CLIENT_FIELDS) {
    if (!partial || Object.hasOwn(body, field)) {
      result[field] = values[field];
    }
  }

  if (Object.hasOwn(body, 'contacts')) {
    if (!Array.isArray(body.contacts) || body.contacts.length > 50) {
      throw new AppError(400, 'contacts debe ser una lista de hasta 50 contactos.');
    }
    result.contacts = body.contacts.map((contact) => validateContactInput(contact));
  }

  if (partial && Object.keys(result).length === 0) {
    throw new AppError(400, 'Indica al menos un campo que actualizar.');
  }

  return result;
}

export function validateContactInput(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'Cada contacto debe ser un objeto.');
  }

  const values = {
    name: optionalText(body.name, 'El nombre del contacto', 120),
    email: optionalText(body.email, 'El email', 254)?.toLowerCase() ?? null,
    phone: optionalText(body.phone, 'El telefono', 40)
  };

  if (!partial && !values.name) {
    throw new AppError(400, 'El nombre del contacto es obligatorio.');
  }
  if (partial && Object.hasOwn(body, 'name') && !values.name) {
    throw new AppError(400, 'El nombre del contacto no puede quedar vacio.');
  }
  if (values.email && !EMAIL_PATTERN.test(values.email)) {
    throw new AppError(400, 'El email no tiene un formato valido.');
  }

  const result = {};
  for (const field of CONTACT_FIELDS) {
    if (!partial || Object.hasOwn(body, field)) {
      result[field] = values[field];
    }
  }

  if (partial && Object.keys(result).length === 0) {
    throw new AppError(400, 'Indica al menos un campo que actualizar.');
  }
  return result;
}

export function getActor(request) {
  const actor = request.get('x-user')?.trim() || 'api';
  if (actor.length > 80 || /[\u0000-\u001f]/.test(actor)) {
    throw new AppError(400, 'El nombre de usuario no es valido.');
  }
  return actor;
}

export function parsePositiveInteger(value, name) {
  if (!/^[1-9]\d*$/.test(String(value ?? ''))) {
    throw new AppError(400, `${name} debe ser un numero entero positivo.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new AppError(400, `${name} esta fuera de rango.`);
  }
  return parsed;
}
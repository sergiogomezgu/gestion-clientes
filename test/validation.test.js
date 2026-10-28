import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../src/errors.js';
import {
  parsePositiveInteger,
  validateClientInput,
  validateContactInput
} from '../src/validation.js';

test('validates required client fields and partial updates', () => {
  assert.equal(
    validateClientInput({ company: 'Empresa', cif: 'B12345678' }).company,
    'Empresa'
  );
  assert.throws(() => validateClientInput({ company: 'Empresa' }), AppError);
  assert.throws(() => validateClientInput({ company: ' ' }), AppError);
  assert.equal(
    validateClientInput({ city: 'Zaragoza' }, { partial: true }).city,
    'Zaragoza'
  );
  assert.throws(() => validateClientInput({}, { partial: true }), AppError);
  assert.throws(
    () => validateClientInput({ cif: ' ' }, { partial: true }),
    AppError
  );
  assert.throws(() => validateClientInput({ company: 'Empresa', status: 'Nuevo' }), AppError);
  assert.throws(
    () => validateClientInput({ contacts: [] }, { partial: true }),
    AppError
  );
});

test('validates contact email and required name', () => {
  assert.equal(
    validateContactInput({ name: 'Ana', email: ' ANA@EXAMPLE.ES ' }).email,
    'ana@example.es'
  );
  assert.throws(
    () => validateContactInput({ name: 'Ana', email: 'not-an-email' }),
    AppError
  );
  assert.throws(() => validateContactInput({ email: 'ana@example.es' }), AppError);
  assert.throws(
    () => validateContactInput({ name: ' ' }, { partial: true }),
    AppError
  );
});

test('validates positive integer route and pagination parameters', () => {
  assert.equal(parsePositiveInteger('12', 'id'), 12);
  assert.throws(() => parsePositiveInteger('0', 'id'), AppError);
  assert.throws(() => parsePositiveInteger('1.5', 'id'), AppError);
});

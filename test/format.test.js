import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeIdentityKey,
  normalizeCif,
  normalizeCompanyName,
  normalizeCountry,
  normalizeStatus,
  parseLegacyAmount,
  parseLegacyDate,
  parseLegacyRate
} from '../src/format.js';

test('normalizes tax identifiers and company names for matching', () => {
  assert.equal(normalizeCif(' b-50123456 '), 'B50123456');
  assert.equal(
    normalizeCompanyName('CONSTRUCCIONES EBRO, S.L.'),
    normalizeCompanyName('Construcciones Ebro SL')
  );
  assert.equal(
    normalizeCompanyName('Hotel Mar Blau SA'),
    normalizeCompanyName('Hotel Mar Blau')
  );
  assert.equal(makeIdentityKey('Empresa', 'b-50123456'), 'cif:B50123456');
});

test('parses valid dates and rejects impossible dates', () => {
  assert.equal(parseLegacyDate('14/01/2025'), '2025-01-14');
  assert.equal(parseLegacyDate('5/3/25'), '2025-03-05');
  assert.equal(parseLegacyDate('2026-09-10'), '2026-09-10');
  assert.equal(parseLegacyDate('31/09/2026'), null);
});

test('parses Spanish-formatted amounts without losing cents', () => {
  assert.equal(parseLegacyAmount('1.250'), '1250.00');
  assert.equal(parseLegacyAmount('1.875,60'), '1875.60');
  assert.equal(parseLegacyAmount('640.5'), '640.50');
  assert.equal(parseLegacyAmount('980,40 €'), '980.40');
  assert.equal(parseLegacyAmount(''), null);
  assert.equal(parseLegacyAmount('no es un importe'), null);
});

test('normalizes VAT rates and client states', () => {
  assert.equal(parseLegacyRate('21%'), '21.00');
  assert.equal(parseLegacyRate('0'), '0.00');
  assert.equal(parseLegacyRate('130%'), null);
  assert.equal(normalizeStatus('ACTIVO'), 'Activo');
  assert.equal(normalizeStatus('Inactivo'), 'Inactivo');
  assert.equal(normalizeStatus('pendiente'), null);
  assert.equal(normalizeCountry('Spain'), 'España');
  assert.equal(normalizeCountry('Italy'), 'Italia');
  assert.equal(normalizeCountry('PT'), 'Portugal');
});

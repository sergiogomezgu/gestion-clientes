const COUNTRY_NAMES = new Map([
  ['espana', 'España'],
  ['spain', 'España'],
  ['italia', 'Italia'],
  ['italy', 'Italia'],
  ['pt', 'Portugal'],
  ['portugal', 'Portugal'],
  ['francia', 'Francia'],
  ['france', 'Francia']
]);

export function normalizeCif(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function normalizeCompanyName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+(s l|s a|s r l|l t d|l l c|l d a|sl|sa|srl|ltd|llc|lda)$/g, '')
    .trim();
}

export function parseLegacyDate(value) {
  const input = String(value ?? '').trim();
  if (!input) {
    return null;
  }

  let year;
  let month;
  let day;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const localMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(input);

  if (isoMatch) {
    [, year, month, day] = isoMatch;
  } else if (localMatch) {
    [, day, month, year] = localMatch;
    if (year.length === 2) {
      year = `20${year}`;
    }
  } else {
    return null;
  }

  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    candidate.getUTCFullYear() !== Number(year)
    || candidate.getUTCMonth() !== Number(month) - 1
    || candidate.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function parseLegacyAmount(value) {
  let input = String(value ?? '')
    .replace(/[€\s]/g, '')
    .trim();

  if (!input) {
    return null;
  }

  const lastComma = input.lastIndexOf(',');
  const lastDot = input.lastIndexOf('.');
  let decimalSeparator = null;

  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0) {
    decimalSeparator = ',';
  } else if (lastDot >= 0) {
    const digitsAfterDot = input.length - lastDot - 1;
    const digitsBeforeDot = lastDot;
    if (!(digitsAfterDot === 3 && digitsBeforeDot >= 1 && digitsBeforeDot <= 3)) {
      decimalSeparator = '.';
    }
  }

  if (decimalSeparator) {
    const decimalIndex = input.lastIndexOf(decimalSeparator);
    const integerPart = input.slice(0, decimalIndex).replace(/[.,]/g, '');
    const fractionPart = input.slice(decimalIndex + 1);
    if (!/^\d+$/.test(integerPart) || !/^\d{1,2}$/.test(fractionPart)) {
      return null;
    }
    input = `${integerPart}.${fractionPart.padEnd(2, '0')}`;
  } else {
    input = input.replace(/[.,]/g, '');
    if (!/^\d+$/.test(input)) {
      return null;
    }
    input += '.00';
  }

  const [whole, fraction] = input.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  if (normalizedWhole.length > 10) {
    return null;
  }
  return `${normalizedWhole}.${fraction}`;
}

export function parseLegacyRate(value) {
  const input = String(value ?? '').trim().replace(/%$/, '').replace(',', '.');
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(input)) {
    return null;
  }

  const rate = Number(input);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return null;
  }
  return rate.toFixed(2);
}

export function normalizeStatus(value) {
  const input = String(value ?? '').trim().toLocaleLowerCase('es');
  if (input === 'activo' || input === 'activa') {
    return 'Activo';
  }
  if (input === 'inactivo' || input === 'inactiva') {
    return 'Inactivo';
  }
  return null;
}

export function normalizeCountry(value) {
  const input = String(value ?? '').trim();
  const key = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return COUNTRY_NAMES.get(key) ?? input;
}

export function makeIdentityKey(company, cif) {
  const normalizedCif = normalizeCif(cif);
  if (normalizedCif) {
    return `cif:${normalizedCif}`;
  }
  return `name:${normalizeCompanyName(company)}`;
}
const PAGE_SIZE = 10;
const SESSION_TOKEN_KEY = 'clientes-api-token';
const SESSION_ACTOR_KEY = 'clientes-user-name';

const elements = {
  loginPanel: document.querySelector('#login-panel'),
  appPanel: document.querySelector('#app-panel'),
  loginForm: document.querySelector('#login-form'),
  loginMessage: document.querySelector('#login-message'),
  tokenInput: document.querySelector('#token-input'),
  actorInput: document.querySelector('#actor-input'),
  sessionName: document.querySelector('#session-name'),
  logoutButton: document.querySelector('#logout-button'),
  filtersForm: document.querySelector('#filters-form'),
  search: document.querySelector('#search-input'),
  statusFilter: document.querySelector('#status-filter'),
  countryFilter: document.querySelector('#country-filter'),
  commercialFilter: document.querySelector('#commercial-filter'),
  clearFilters: document.querySelector('#clear-filters'),
  createButton: document.querySelector('#create-button'),
  rows: document.querySelector('#client-rows'),
  statusMessage: document.querySelector('#status-message'),
  resultCount: document.querySelector('#result-count'),
  pageLabel: document.querySelector('#page-label'),
  previousPage: document.querySelector('#previous-page'),
  nextPage: document.querySelector('#next-page'),
  clientDialog: document.querySelector('#client-dialog'),
  clientForm: document.querySelector('#client-form'),
  clientDialogTitle: document.querySelector('#client-dialog-title'),
  clientFormMessage: document.querySelector('#client-form-message'),
  contactDialog: document.querySelector('#contact-dialog'),
  contactForm: document.querySelector('#contact-form'),
  contactDialogTitle: document.querySelector('#contact-dialog-title'),
  contactFormMessage: document.querySelector('#contact-form-message'),
  detailDialog: document.querySelector('#detail-dialog'),
  detailTitle: document.querySelector('#detail-title'),
  detailContent: document.querySelector('#detail-content'),
  detailMessage: document.querySelector('#detail-message')
};

const state = {
  token: sessionStorage.getItem(SESSION_TOKEN_KEY) ?? '',
  actor: sessionStorage.getItem(SESSION_ACTOR_KEY) ?? '',
  page: 1,
  total: 0,
  clientId: null,
  editingClientId: null,
  editingContactId: null
};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }
  if (className) {
    node.className = className;
  }
  return node;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(Number(value ?? 0));
}

function formatDate(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('es-ES').format(date);
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
}

function showMessage(node, text, isError = false) {
  node.textContent = text;
  node.classList.toggle('error', isError);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  headers.set('Authorization', `Bearer ${state.token}`);
  headers.set('X-User', state.actor);
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const contentType = response.headers.get('content-type') ?? '';
  const result = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (response.status === 401) {
    signOut();
    throw new Error('El token ha caducado o no es correcto. Vuelve a iniciar sesión.');
  }
  if (!response.ok) {
    throw new Error(result?.error ?? `La petición ha fallado (${response.status}).`);
  }
  return result;
}

function signIn() {
  elements.loginPanel.hidden = true;
  elements.appPanel.hidden = false;
  elements.logoutButton.hidden = false;
  elements.sessionName.textContent = state.actor;
  elements.tokenInput.value = '';
}

function signOut() {
  state.token = '';
  state.actor = '';
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_ACTOR_KEY);
  elements.loginPanel.hidden = false;
  elements.appPanel.hidden = true;
  elements.logoutButton.hidden = true;
  elements.sessionName.textContent = '';
}

function currentFilters() {
  return new URLSearchParams({
    page: String(state.page),
    limit: String(PAGE_SIZE),
    q: elements.search.value.trim(),
    estado: elements.statusFilter.value,
    pais: elements.countryFilter.value.trim(),
    comercial: elements.commercialFilter.value.trim()
  });
}

function createBadge(status) {
  return element('span', status, `badge ${status === 'Activo' ? 'badge-active' : 'badge-inactive'}`);
}

function renderClientRows(clients) {
  elements.rows.replaceChildren();

  if (clients.length === 0) {
    const row = element('tr');
    const cell = element('td', 'No hay clientes que coincidan con estos filtros.', 'empty-row');
    cell.colSpan = 7;
    row.append(cell);
    elements.rows.append(row);
    return;
  }

  for (const client of clients) {
    const row = element('tr');
    const companyCell = element('td');
    const companySummary = element('div', undefined, 'cell-stack');
    companySummary.append(
      element('span', client.company, 'company-name'),
      element('span', client.cif || 'Sin CIF', 'cell-meta')
    );
    companyCell.append(companySummary);
    const contactsCell = element('td', client.contacts?.join(', ') || '—');
    const cityCell = element('td', [client.city, client.country].filter(Boolean).join(', ') || '—');
    const commercialCell = element('td', client.commercial || '—');
    const statusCell = element('td');
    statusCell.append(createBadge(client.status));
    const totalCell = element('td');
    const billingSummary = element('div', undefined, 'cell-stack');
    billingSummary.append(
      element('span', formatCurrency(client.accumulatedBase)),
      element('span', `${client.invoiceCount} ${client.invoiceCount === 1 ? 'factura' : 'facturas'}`, 'cell-meta')
    );
    totalCell.append(billingSummary);
    const actionsCell = element('td');
    actionsCell.className = 'row-actions';

    const viewButton = element('button', 'Ver');
    viewButton.className = 'button button-secondary button-small';
    viewButton.type = 'button';
    viewButton.dataset.action = 'view';
    viewButton.dataset.id = client.id;
    viewButton.setAttribute('aria-label', `Ver ficha de ${client.company}`);
    const editButton = element('button', 'Editar');
    editButton.className = 'button button-quiet button-small';
    editButton.type = 'button';
    editButton.dataset.action = 'edit';
    editButton.dataset.id = client.id;
    editButton.setAttribute('aria-label', `Editar ${client.company}`);

    actionsCell.append(viewButton, editButton);
    row.append(companyCell, contactsCell, cityCell, commercialCell, statusCell, totalCell, actionsCell);
    elements.rows.append(row);
  }
}

async function loadClients() {
  elements.statusMessage.textContent = 'Cargando clientes…';
  elements.statusMessage.classList.remove('error');
  try {
    const result = await api(`/api/clientes?${currentFilters()}`);
    state.total = result.total;
    const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
    if (state.page > pages) {
      state.page = pages;
      await loadClients();
      return;
    }
    renderClientRows(result.data);
    elements.resultCount.textContent = `${result.total} ${result.total === 1 ? 'cliente' : 'clientes'}`;
    elements.pageLabel.textContent = `Página ${state.page} de ${pages}`;
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= pages;
    elements.statusMessage.textContent = '';
  } catch (error) {
    if (!state.token) {
      showMessage(elements.loginMessage, error.message, true);
    } else {
      elements.statusMessage.textContent = error.message;
      elements.statusMessage.classList.add('error');
    }
  }
}

function openClientForm(client) {
  state.editingClientId = client?.id ?? null;
  elements.clientForm.reset();
  elements.clientFormMessage.textContent = '';
  elements.clientDialogTitle.textContent = client ? 'Editar cliente' : 'Nuevo cliente';
  const fields = elements.clientForm.elements;
  for (const name of [
    'company',
    'cif',
    'address',
    'postalCode',
    'city',
    'country',
    'commercial',
    'status',
    'registeredAt'
  ]) {
    if (client && fields.namedItem(name)) {
      fields.namedItem(name).value = client[name] ?? (name === 'status' ? 'Activo' : '');
    }
  }
  elements.clientDialog.showModal();
  fields.namedItem('company').focus();
}

async function openClientDetail(id) {
  state.clientId = id;
  elements.detailContent.replaceChildren(element('p', 'Cargando ficha…', 'muted'));
  elements.detailMessage.textContent = '';
  elements.detailDialog.showModal();
  try {
    const [client, history] = await Promise.all([
      api(`/api/clientes/${id}`),
      api(`/api/clientes/${id}/historico`)
    ]);
    renderClientDetail(client, history);
  } catch (error) {
    elements.detailContent.replaceChildren(element('p', error.message, 'form-message error'));
  }
}

function makeSection(title, actionLabel, actionHandler) {
  const section = element('section', undefined, 'detail-card');
  const heading = element('div', undefined, 'section-heading');
  heading.append(element('h3', title));
  if (actionLabel) {
    const button = element('button', actionLabel, 'button button-secondary button-small');
    button.type = 'button';
    button.addEventListener('click', actionHandler);
    heading.append(button);
  }
  section.append(heading);
  return section;
}

function renderClientDetail(client, history) {
  elements.detailTitle.textContent = client.company;
  elements.detailContent.replaceChildren();

  const summary = makeSection('Datos generales');
  const list = element('dl', undefined, 'summary-grid');
  const values = [
    ['CIF', client.cif || '—'],
    ['Estado', client.status],
    ['Ciudad', [client.city, client.country].filter(Boolean).join(', ') || '—'],
    ['Código postal', client.postalCode || '—'],
    ['Dirección', client.address || '—'],
    ['Comercial', client.commercial || '—'],
    ['Alta', formatDate(client.registeredAt)],
    ['Última modificación', formatDateTime(client.updatedAt)],
    ['Facturación acumulada (base)', formatCurrency(client.accumulatedBase)],
    ['Total de facturas con IVA', formatCurrency(client.accumulatedTotal)]
  ];
  for (const [label, value] of values) {
    const item = element('div', undefined, 'summary-item');
    item.append(element('dt', label), element('dd', value));
    list.append(item);
  }
  summary.append(list);

  const contacts = makeSection('Contactos', 'Añadir contacto', () => openContactForm());
  if (client.contacts.length === 0) {
    contacts.append(element('p', 'Todavía no hay contactos.', 'muted'));
  } else {
    const table = createDetailTable(['Nombre', 'Email', 'Teléfono', 'Acciones']);
    for (const contact of client.contacts) {
      const row = element('tr');
      row.append(
        element('td', contact.name),
        element('td', contact.email || '—'),
        element('td', contact.phone || '—')
      );
      const actions = element('td');
      const edit = element('button', 'Editar', 'button button-quiet button-small');
      edit.type = 'button';
      edit.addEventListener('click', () => openContactForm(contact));
      const remove = element('button', 'Eliminar', 'button button-danger button-small');
      remove.type = 'button';
      remove.addEventListener('click', () => removeContact(contact));
      actions.append(edit, remove);
      row.append(actions);
      table.tbody.append(row);
    }
    contacts.append(table.table);
  }

  const invoices = makeSection('Facturas');
  if (client.invoices.length === 0) {
    invoices.append(element('p', 'Todavía no hay facturas.', 'muted'));
  } else {
    const table = createDetailTable(['Número', 'Fecha', 'Base imponible', 'IVA', 'Total']);
    for (const invoice of client.invoices) {
      const row = element('tr');
      row.append(
        element('td', invoice.number),
        element('td', formatDate(invoice.date)),
        element('td', formatCurrency(invoice.taxableBase)),
        element('td', `${Number(invoice.vatRate).toLocaleString('es-ES')} %`),
        element('td', formatCurrency(invoice.total))
      );
      table.tbody.append(row);
    }
    invoices.append(table.table);
  }

  const historySection = makeSection('Historial de cambios');
  if (history.length === 0) {
    historySection.append(element('p', 'No hay cambios registrados.', 'muted'));
  } else {
    for (const entry of history) {
      const event = element('article', undefined, 'history-event');
      const entityNames = { cliente: 'Cliente', contacto: 'Contacto' };
      const fieldNames = {
        company: 'empresa',
        cif: 'CIF',
        address: 'dirección',
        postalCode: 'código postal',
        city: 'ciudad',
        country: 'país',
        commercial: 'comercial',
        status: 'estado',
        registeredAt: 'fecha de alta',
        archivedAt: 'eliminado',
        name: 'nombre',
        email: 'correo',
        phone: 'teléfono',
        cliente: 'creado',
        contacto: 'creado',
        factura: 'registrada',
        eliminada: 'eliminada'
      };
      const entityName = entityNames[entry.entityType] ?? entry.entityType;
      const fieldName = fieldNames[entry.field] ?? entry.field;
      const label = `${entityName} · ${fieldName}`;
      event.append(
        element('strong', label),
        element('span', `Por ${entry.changedBy}`),
        element('span', `Antes: ${formatHistoryValue(entry.oldValue)}`),
        element('span', `Después: ${formatHistoryValue(entry.newValue)}`),
        element('span', formatDateTime(entry.changedAt), 'history-meta')
      );
      historySection.append(event);
    }
  }

  const editButton = element('button', 'Editar datos del cliente', 'button button-secondary');
  editButton.type = 'button';
  editButton.addEventListener('click', () => openClientForm(client));
  const archiveButton = element('button', 'Eliminar cliente', 'button button-danger');
  archiveButton.type = 'button';
  archiveButton.addEventListener('click', () => archiveCurrentClient(client));
  const actions = element('div', undefined, 'row-actions');
  actions.append(editButton, archiveButton);

  elements.detailContent.append(summary, contacts, invoices, historySection, actions);
}

function createDetailTable(headers) {
  const table = element('table', undefined, 'detail-table');
  const thead = element('thead');
  const headerRow = element('tr');
  for (const heading of headers) {
    headerRow.append(element('th', heading));
  }
  thead.append(headerRow);
  const tbody = element('tbody');
  table.append(thead, tbody);
  return { table, tbody };
}

function formatHistoryValue(value) {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function openContactForm(contact) {
  state.editingContactId = contact?.id ?? null;
  elements.contactForm.reset();
  elements.contactFormMessage.textContent = '';
  elements.contactDialogTitle.textContent = contact ? 'Editar contacto' : 'Añadir contacto';
  for (const name of ['name', 'email', 'phone']) {
    elements.contactForm.elements.namedItem(name).value = contact?.[name] ?? '';
  }
  elements.contactDialog.showModal();
  elements.contactForm.elements.namedItem('name').focus();
}

async function removeContact(contact) {
  if (!window.confirm(`¿Eliminar el contacto ${contact.name}?`)) {
    return;
  }
  try {
    await api(`/api/contactos/${contact.id}`, { method: 'DELETE' });
    await openClientDetail(state.clientId);
  } catch (error) {
    showMessage(elements.detailMessage, error.message, true);
  }
}

async function archiveCurrentClient(client) {
  if (!window.confirm(`¿Eliminar ${client.company}? Se conservará su historial.`)) {
    return;
  }
  try {
    await api(`/api/clientes/${client.id}`, { method: 'DELETE' });
    elements.detailDialog.close();
    await loadClients();
  } catch (error) {
    showMessage(elements.detailMessage, error.message, true);
  }
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = elements.tokenInput.value.trim();
  const actor = elements.actorInput.value.trim();
  if (token.length < 32 || !actor) {
    showMessage(elements.loginMessage, 'Introduce un token de al menos 32 caracteres y tu nombre.', true);
    return;
  }

  state.token = token;
  state.actor = actor;
  try {
    await api('/api/clientes?limit=1');
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_ACTOR_KEY, actor);
    signIn();
    await loadClients();
  } catch (error) {
    signOut();
    showMessage(elements.loginMessage, error.message, true);
  }
});

elements.logoutButton.addEventListener('click', signOut);
elements.filtersForm.addEventListener('submit', (event) => {
  event.preventDefault();
  state.page = 1;
  loadClients();
});
elements.clearFilters.addEventListener('click', () => {
  elements.filtersForm.reset();
  state.page = 1;
  loadClients();
});
elements.createButton.addEventListener('click', () => openClientForm());
elements.previousPage.addEventListener('click', () => {
  if (state.page > 1) {
    state.page -= 1;
    loadClients();
  }
});
elements.nextPage.addEventListener('click', () => {
  if (state.page * PAGE_SIZE < state.total) {
    state.page += 1;
    loadClients();
  }
});
elements.rows.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }
  try {
    if (button.dataset.action === 'view') {
      await openClientDetail(button.dataset.id);
    } else {
      const client = await api(`/api/clientes/${button.dataset.id}`);
      openClientForm(client);
    }
  } catch (error) {
    elements.statusMessage.textContent = error.message;
    elements.statusMessage.classList.add('error');
  }
});

elements.clientForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(elements.clientForm));
  const body = values;
  const method = state.editingClientId ? 'PUT' : 'POST';
  const path = state.editingClientId
    ? `/api/clientes/${state.editingClientId}`
    : '/api/clientes';
  try {
    const saved = await api(path, { method, body });
    elements.clientDialog.close();
    await loadClients();
    if (method === 'POST') {
      await openClientDetail(saved.id);
    } else if (state.clientId === saved.id && elements.detailDialog.open) {
      await openClientDetail(saved.id);
    }
  } catch (error) {
    showMessage(elements.clientFormMessage, error.message, true);
  }
});

elements.contactForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(elements.contactForm));
  const method = state.editingContactId ? 'PUT' : 'POST';
  const path = state.editingContactId
    ? `/api/contactos/${state.editingContactId}`
    : `/api/clientes/${state.clientId}/contactos`;
  try {
    await api(path, { method, body });
    elements.contactDialog.close();
    await openClientDetail(state.clientId);
  } catch (error) {
    showMessage(elements.contactFormMessage, error.message, true);
  }
});

document.querySelectorAll('[data-close]').forEach((button) => {
  button.addEventListener('click', () => {
    document.getElementById(button.dataset.close).close();
  });
});

if (state.token && state.actor) {
  signIn();
  loadClients();
}

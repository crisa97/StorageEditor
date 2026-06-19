'use strict';

/* ==============================
   STATE
   ============================== */
const state = {
  tabUrl: '',
  tabId: null,
  cookieStoreId: null,
  currentTab: 'cookies',
  cookies: [],
  lsData: [],
  idbDatabases: [],
  selectedDB: null,
  selectedStore: null,
  idbRecords: [],
};

/* ==============================
   DOM HELPERS
   ============================== */
const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => [...(c || document).querySelectorAll(s)];

function htmlToEl(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.firstElementChild;
}

/* ==============================
   TOAST
   ============================== */
function showToast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  const container = $('#toast-container');
  container.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 2800);
}

/* ==============================
   MODAL
   ============================== */
let modalCallback = null;

function showModal(html) {
  $('#modal-body').innerHTML = html;
  $('#modal-overlay').classList.add('active');
  $('#modal-body').querySelectorAll('[data-action="close"]').forEach(el => {
    el.addEventListener('click', closeModal);
  });
}

function closeModal() {
  $('#modal-overlay').classList.remove('active');
  modalCallback = null;
}

$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

document.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-toggle-expand')) {
    e.target.classList.toggle('expanded');
  }
});

/* ==============================
   EXECUTE SCRIPT IN TAB
   ============================== */
async function execInTab(fn, args = []) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: state.tabId },
    func: fn,
    args,
  });
  return results[0].result;
}

/* ==============================
   TAB SYSTEM
   ============================== */
function setupTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('#cookies-add').addEventListener('click', () => showCookieModal(null, true));
  $('#cookies-export').addEventListener('click', exportCookies);
  $('#cookies-import').addEventListener('click', showImportCookies);
  $('#cookies-clear').addEventListener('click', clearCookies);

  $('#ls-add').addEventListener('click', () => showLSModal(null, null, true));
  $('#ls-export').addEventListener('click', exportLS);
  $('#ls-import').addEventListener('click', showImportLS);
  $('#ls-clear').addEventListener('click', clearLS);

  $('#idb-add').addEventListener('click', showAddIDBRecord);
  $('#idb-export-all').addEventListener('click', exportIDBAll);
  $('#idb-export-store').addEventListener('click', exportIDBStore);
  $('#idb-import').addEventListener('click', showImportIDB);
  $('#idb-delete-db').addEventListener('click', deleteIDB);
}

function switchTab(name) {
  state.currentTab = name;
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));

  if (name === 'cookies') loadCookies();
  else if (name === 'localstorage') loadLocalStorage();
  else if (name === 'indexeddb') loadIndexedDB();
}

/* ==============================
   COOKIES
   ============================== */
async function loadCookies() {
  const c = $('#cookies-content');
  c.innerHTML = '<div class="status-msg"><span class="spinner"></span> Cargando cookies...</div>';
  try {
    const urlObj = new URL(state.tabUrl);
    const originUrl = urlObj.origin + '/';
    const cookies = await chrome.cookies.getAll({ url: originUrl, storeId: state.cookieStoreId });
    state.cookies = cookies;
    renderCookies();
  } catch (e) {
    c.innerHTML = `<div class="empty-state"><p>Error al cargar cookies: ${e.message}</p></div>`;
  }
}

function renderCookies() {
  const c = $('#cookies-content');
  if (state.cookies.length === 0) {
    c.innerHTML = '<div class="empty-state"><p>No hay cookies para este dominio.</p></div>';
    return;
  }

  let html = `<div class="table-wrap"><table>
    <thead><tr>
      <th>Nombre</th><th>Valor</th><th>Dominio</th><th>Path</th><th>Expira</th><th>Flags</th><th></th>
    </tr></thead><tbody>`;

  state.cookies.forEach((ck, i) => {
    const val = ck.value || '';
    const valShort = val.length > 60 ? val.slice(0, 60) + '...' : val;
    const exp = ck.expirationDate
      ? new Date(ck.expirationDate * 1000).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
      : 'Sesión';

    let flags = '';
    if (ck.secure) flags += '<span class="badge badge-secure" title="Secure">S</span>';
    if (ck.httpOnly) flags += '<span class="badge badge-httponly" title="HttpOnly">H</span>';
    if (ck.sameSite && ck.sameSite !== 'unspecified') {
      const lbl = { no_restriction: 'None', lax: 'Lax', strict: 'Strict' }[ck.sameSite] || ck.sameSite;
      flags += `<span class="badge badge-samesite" title="SameSite">${lbl}</span>`;
    }

    html += `<tr>
      <td class="key-cell" title="${escHtml(ck.name)}">${escHtml(ck.name)}</td>
      <td><div class="val-cell" data-toggle-expand title="${escHtml(val)}">${escHtml(valShort)}</div></td>
      <td>${escHtml(ck.domain || '')}</td>
      <td>${escHtml(ck.path || '')}</td>
      <td style="white-space:nowrap;font-size:10px">${exp}</td>
      <td>${flags}</td>
      <td class="actions-cell">
        <button class="btn btn-sm" data-edit-cookie="${i}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del-cookie="${i}">X</button>
      </td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  c.innerHTML = html;

  c.querySelectorAll('[data-edit-cookie]').forEach(b => {
    b.addEventListener('click', () => showCookieModal(state.cookies[+b.dataset.editCookie], false));
  });
  c.querySelectorAll('[data-del-cookie]').forEach(b => {
    b.addEventListener('click', () => deleteCookie(state.cookies[+b.dataset.delCookie]));
  });
}

function escHtml(s) {
  if (typeof s !== 'string') return String(s || '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cookieToUrl(ck) {
  const proto = ck.secure ? 'https:' : 'http:';
  const host = ck.domain ? ck.domain.replace(/^\./, '') : new URL(state.tabUrl).hostname;
  return proto + '//' + host + (ck.path || '/');
}

function showCookieModal(cookie, isNew) {
  const ck = cookie || { name: '', value: '', domain: new URL(state.tabUrl).hostname, path: '/', secure: false, httpOnly: false, sameSite: 'unspecified', expirationDate: '' };
  const title = isNew ? 'Nueva cookie' : 'Editar cookie';

  const html = `<h3>${title}</h3>
    <div class="form-group"><label>Nombre</label><input id="ck-name" value="${escHtml(ck.name)}" ${isNew ? '' : 'readonly'}/></div>
    <div class="form-group"><label>Valor</label><textarea id="ck-value" rows="2">${escHtml(ck.value)}</textarea></div>
    <div class="form-row">
      <div class="form-group" style="flex:2"><label>Dominio</label><input id="ck-domain" value="${escHtml(ck.domain || '')}"/></div>
      <div class="form-group" style="flex:1"><label>Path</label><input id="ck-path" value="${escHtml(ck.path || '/')}"/></div>
    </div>
    <div class="form-group"><label>Expiración (timestamp UNIX o vacío para sesión)</label><input id="ck-exp" value="${ck.expirationDate || ''}" placeholder="ej: 1893456000"/></div>
    <div class="checkbox-group">
      <label><input type="checkbox" id="ck-secure" ${ck.secure ? 'checked' : ''}> Secure</label>
      <label><input type="checkbox" id="ck-httponly" ${ck.httpOnly ? 'checked' : ''}> HttpOnly</label>
    </div>
    <div class="form-group"><label>SameSite</label>
      <select id="ck-samesite">
        <option value="unspecified" ${ck.sameSite === 'unspecified' ? 'selected' : ''}>No especificado</option>
        <option value="no_restriction" ${ck.sameSite === 'no_restriction' ? 'selected' : ''}>None</option>
        <option value="lax" ${ck.sameSite === 'lax' ? 'selected' : ''}>Lax</option>
        <option value="strict" ${ck.sameSite === 'strict' ? 'selected' : ''}>Strict</option>
      </select>
    </div>
    <div class="form-actions">
      <button class="btn" data-action="close">Cancelar</button>
      <button class="btn btn-primary" id="ck-save">Guardar</button>
    </div>`;

  showModal(html);

  const saveBtn = $('#ck-save');
  saveBtn.addEventListener('click', async () => {
    const data = {
      name: $('#ck-name').value.trim(),
      value: $('#ck-value').value,
      domain: $('#ck-domain').value.trim(),
      path: $('#ck-path').value.trim() || '/',
      secure: $('#ck-secure').checked,
      httpOnly: $('#ck-httponly').checked,
      sameSite: $('#ck-samesite').value,
      expirationDate: $('#ck-exp').value.trim() ? parseFloat($('#ck-exp').value.trim()) : undefined,
    };

    if (!data.name) { showToast('El nombre es obligatorio.', 'error'); return; }

    try {
      const url = cookieToUrl(data);

      if (!isNew && cookie) {
        const oldUrl = cookieToUrl(cookie);
        await chrome.cookies.remove({ url: oldUrl, name: cookie.name }).catch(() => {});
      }

      await chrome.cookies.set({ url, ...data, storeId: undefined });
      closeModal();
      showToast(isNew ? 'Cookie creada.' : 'Cookie actualizada.');
      loadCookies();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  });
}

async function deleteCookie(cookie) {
  if (!confirm('Eliminar la cookie "' + cookie.name + '"?')) return;
  try {
    const url = cookieToUrl(cookie);
    await chrome.cookies.remove({ url, name: cookie.name });
    showToast('Cookie eliminada.');
    loadCookies();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function exportCookies() {
  if (state.cookies.length === 0) { showToast('No hay cookies para exportar.', 'info'); return; }
  const json = JSON.stringify(state.cookies, null, 2);
  copyOrDownload(json, 'cookies.json');
}

async function showImportCookies() {
  showModal(`<h3>Importar cookies</h3>
    <p>Pega un array JSON de objetos cookie. Cada objeto debe tener al menos <strong>name</strong> y <strong>value</strong>.</p>
    <div class="form-group"><textarea id="import-json" rows="6" placeholder='[{"name":"test","value":"123","domain":"example.com","path":"/","secure":false}]'></textarea></div>
    <div class="form-actions">
      <button class="btn" data-action="close">Cancelar</button>
      <button class="btn btn-primary" id="import-exec">Importar</button>
    </div>`);

  $('#import-exec').addEventListener('click', async () => {
    const raw = $('#import-json').value.trim();
    if (!raw) { showToast('Pega el JSON primero.', 'error'); return; }
    let arr;
    try { arr = JSON.parse(raw); } catch (e) { showToast('JSON inválido: ' + e.message, 'error'); return; }
    if (!Array.isArray(arr)) { showToast('Debe ser un array de objetos.', 'error'); return; }

    let ok = 0, errs = 0;
    for (const ck of arr) {
      if (!ck.name || ck.value === undefined) { errs++; continue; }
      try {
        const url = cookieToUrl(ck);
        await chrome.cookies.set({ url, name: ck.name, value: String(ck.value), domain: ck.domain, path: ck.path || '/', secure: !!ck.secure, httpOnly: !!ck.httpOnly, sameSite: ck.sameSite || 'unspecified', expirationDate: ck.expirationDate ? Number(ck.expirationDate) : undefined });
        ok++;
      } catch { errs++; }
    }

    closeModal();
    showToast(`Importación completada: ${ok} correctas${errs ? ', ' + errs + ' fallos' : ''}.`, errs && !ok ? 'error' : 'success');
    if (ok) loadCookies();
  });
}

async function clearCookies() {
  if (state.cookies.length === 0) { showToast('No hay cookies que limpiar.', 'info'); return; }
  if (!confirm('Eliminar todas las cookies (' + state.cookies.length + ') de ' + new URL(state.tabUrl).hostname + '?')) return;

  let ok = 0, errs = 0;
  for (const ck of state.cookies) {
    try {
      const url = cookieToUrl(ck);
      await chrome.cookies.remove({ url, name: ck.name });
      ok++;
    } catch { errs++; }
  }
  showToast(`Se eliminaron ${ok} cookies${errs ? ' (' + errs + ' errores)' : ''}.`);
  loadCookies();
}

/* ==============================
   LOCAL STORAGE
   ============================== */
async function loadLocalStorage() {
  const c = $('#ls-content');
  c.innerHTML = '<div class="status-msg"><span class="spinner"></span> Cargando Local Storage...</div>';
  try {
    const data = await execInTab(() => {
      const items = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        items.push({ key: k, value: localStorage.getItem(k) });
      }
      return items;
    });
    state.lsData = data || [];
    renderLS();
  } catch (e) {
    c.innerHTML = `<div class="empty-state"><p>Error al cargar Local Storage: ${e.message}</p></div>`;
  }
}

function renderLS() {
  const c = $('#ls-content');
  if (state.lsData.length === 0) {
    c.innerHTML = '<div class="empty-state"><p>No hay datos en Local Storage.</p></div>';
    return;
  }

  let html = `<div class="table-wrap"><table><thead><tr><th>Clave</th><th>Valor</th><th></th></tr></thead><tbody>`;
  state.lsData.forEach((item) => {
    const val = item.value || '';
    const valShort = val.length > 100 ? val.slice(0, 100) + '...' : val;
    html += `<tr>
      <td class="key-cell" title="${escHtml(item.key)}">${escHtml(item.key)}</td>
      <td><div class="val-cell" data-toggle-expand title="${escHtml(val)}">${escHtml(valShort)}</div></td>
      <td class="actions-cell">
        <button class="btn btn-sm" data-edit-ls="${escHtml(item.key)}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del-ls="${escHtml(item.key)}">X</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  c.innerHTML = html;

  c.querySelectorAll('[data-edit-ls]').forEach(b => {
    b.addEventListener('click', () => {
      const key = b.dataset.editLs;
      const item = state.lsData.find(i => i.key === key);
      showLSModal(key, item ? item.value : '', false);
    });
  });
  c.querySelectorAll('[data-del-ls]').forEach(b => {
    b.addEventListener('click', () => deleteLS(b.dataset.delLs));
  });
}

function showLSModal(key, value, isNew) {
  const title = isNew ? 'Nuevo elemento' : 'Editar elemento';
  const html = `<h3>${title}</h3>
    <div class="form-group"><label>Clave</label><input id="ls-key" value="${escHtml(key || '')}"/></div>
    <div class="form-group"><label>Valor</label><textarea id="ls-value" rows="4">${escHtml(value || '')}</textarea></div>
    <div class="form-actions">
      <button class="btn" data-action="close">Cancelar</button>
      <button class="btn btn-primary" id="ls-save">Guardar</button>
    </div>`;

  showModal(html);

  $('#ls-save').addEventListener('click', async () => {
    const newKey = $('#ls-key').value.trim();
    const newVal = $('#ls-value').value;
    if (!newKey) { showToast('La clave es obligatoria.', 'error'); return; }

    try {
      if (!isNew && key !== newKey) {
        await execInTab((k) => { localStorage.removeItem(k); }, [key]);
      }
      await execInTab((k, v) => { localStorage.setItem(k, v); }, [newKey, newVal]);
      closeModal();
      showToast(isNew ? 'Elemento creado.' : 'Elemento actualizado.');
      loadLocalStorage();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  });
}

async function deleteLS(key) {
  if (!confirm('Eliminar la clave "' + key + '"?')) return;
  try {
    await execInTab((k) => { localStorage.removeItem(k); }, [key]);
    showToast('Elemento eliminado.');
    loadLocalStorage();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function exportLS() {
  if (state.lsData.length === 0) { showToast('No hay datos para exportar.', 'info'); return; }
  const obj = {};
  state.lsData.forEach(i => { obj[i.key] = i.value; });
  copyOrDownload(JSON.stringify(obj, null, 2), 'localStorage.json');
}

function showImportLS() {
  showModal(`<h3>Importar Local Storage</h3>
    <p>Pega un objeto JSON con pares clave:valor.</p>
    <div class="form-group"><textarea id="import-json" rows="6" placeholder='{"key1":"value1","key2":"value2"}'></textarea></div>
    <div class="checkbox-group">
      <label><input type="checkbox" id="import-ls-replace"> Reemplazar todo (limpiar antes de importar)</label>
    </div>
    <div class="form-actions">
      <button class="btn" data-action="close">Cancelar</button>
      <button class="btn btn-primary" id="import-exec">Importar</button>
    </div>`);

  $('#import-exec').addEventListener('click', async () => {
    const raw = $('#import-json').value.trim();
    if (!raw) { showToast('Pega el JSON primero.', 'error'); return; }
    let data;
    try { data = JSON.parse(raw); } catch (e) { showToast('JSON inválido: ' + e.message, 'error'); return; }
    if (typeof data !== 'object' || Array.isArray(data)) { showToast('Debe ser un objeto con pares clave:valor.', 'error'); return; }

    const replace = $('#import-ls-replace').checked;

    try {
      await execInTab((jsonStr, shouldReplace) => {
        const d = JSON.parse(jsonStr);
        if (shouldReplace) localStorage.clear();
        Object.entries(d).forEach(([k, v]) => {
          localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
        });
        return Object.keys(d).length;
      }, [JSON.stringify(data), replace]);
      closeModal();
      showToast(`Importados ${Object.keys(data).length} elementos.`);
      loadLocalStorage();
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  });
}

async function clearLS() {
  if (state.lsData.length === 0) { showToast('No hay datos que limpiar.', 'info'); return; }
  if (!confirm('Eliminar todos los datos de Local Storage (' + state.lsData.length + ' claves)?')) return;
  try {
    await execInTab(() => { localStorage.clear(); });
    showToast('Local Storage limpiado.');
    loadLocalStorage();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ==============================
   INDEXED DB
   ============================== */
async function loadIndexedDB() {
  const tree = $('#idb-tree');
  const records = $('#idb-records');
  tree.innerHTML = '<div class="status-msg"><span class="spinner"></span> Cargando bases de datos...</div>';
  records.innerHTML = '';

  try {
    const dbs = await execInTab(() => {
      return indexedDB.databases().then(dbs => dbs.map(d => ({ name: d.name, version: d.version })));
    });
    state.idbDatabases = dbs || [];
    state.selectedDB = null;
    state.selectedStore = null;
    state.idbRecords = [];
    renderIDBTree();
  } catch (e) {
    if (e.message && e.message.includes('databases')) {
      tree.innerHTML = '<div class="empty-state"><p>indexedDB.databases() no está disponible en este navegador. Actualiza Chrome 76+.</p></div>';
    } else {
      tree.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
    }
  }
}

function renderIDBTree() {
  const tree = $('#idb-tree');
  if (state.idbDatabases.length === 0) {
    tree.innerHTML = '<div class="empty-state"><p>No se encontraron bases de datos IndexedDB.</p></div>';
    return;
  }

  let html = '<div class="idb-tree-panel">';
  state.idbDatabases.forEach((db, di) => {
    const active = state.selectedDB && state.selectedDB.name === db.name ? 'active' : '';
    html += `<div class="idb-tree-item ${active}" data-db-idx="${di}">
      <span class="arrow">&#9654;</span>
      <span class="tree-label">${escHtml(db.name)}</span>
      <span class="tree-badge">v${db.version !== undefined ? db.version : '?'}</span>
    </div>`;
    if (state.selectedDB && state.selectedDB.name === db.name && state.selectedDB._stores) {
      html += '<div class="idb-children">';
      state.selectedDB._stores.forEach((st, si) => {
        const sActive = state.selectedStore === st.name ? 'active' : '';
        html += `<div class="idb-tree-item store ${sActive}" data-db-name="${escHtml(db.name)}" data-store="${escHtml(st.name)}">
          <span class="tree-label" style="padding-left:6px">- ${escHtml(st.name)}</span>
        </div>`;
      });
      html += '</div>';
    }
  });
  html += '</div>';
  tree.innerHTML = html;

  tree.querySelectorAll('[data-db-idx]').forEach(el => {
    el.addEventListener('click', async () => {
      const di = +el.dataset.dbIdx;
      const db = state.idbDatabases[di];
      if (state.selectedDB && state.selectedDB.name === db.name) {
        state.selectedDB = null;
        state.selectedStore = null;
        state.idbRecords = [];
        renderIDBTree();
        $('#idb-records').innerHTML = '';
        return;
      }
      await loadStores(db);
    });
  });

  tree.querySelectorAll('[data-store]').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const dbName = el.dataset.dbName;
      const storeName = el.dataset.store;
      if (state.selectedStore === storeName && state.selectedDB && state.selectedDB.name === dbName) {
        state.selectedStore = null;
        state.idbRecords = [];
        $('#idb-records').innerHTML = '';
        renderIDBTree();
        return;
      }
      await loadRecords(dbName, storeName);
    });
  });

  if (state.selectedStore && state.idbRecords.length > 0) {
    renderIDBRecords();
  }
}

async function loadStores(db) {
  const recordsDiv = $('#idb-records');
  recordsDiv.innerHTML = '<div class="status-msg"><span class="spinner"></span> Cargando stores...</div>';

  try {
    const result = await execInTab((dbName) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = (e) => {
          const d = e.target.result;
          const stores = Array.from(d.objectStoreNames).map(n => ({ name: n }));
          const version = d.version;
          d.close();
          resolve({ stores, version });
        };
        req.onerror = () => reject(req.error);
      });
    }, [db.name]);

    db._stores = result.stores;
    state.selectedDB = db;
    state.selectedStore = null;
    state.idbRecords = [];
    renderIDBTree();
    recordsDiv.innerHTML = '<div class="empty-state"><p>Selecciona un object store para ver sus registros.</p></div>';
  } catch (e) {
    recordsDiv.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

async function loadRecords(dbName, storeName) {
  const recordsDiv = $('#idb-records');
  recordsDiv.innerHTML = '<div class="status-msg"><span class="spinner"></span> Cargando registros...</div>';

  try {
    const records = await execInTab((db, st) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(db);
        req.onsuccess = (e) => {
          const d = e.target.result;
          try {
            const tx = d.transaction(st, 'readonly');
            const store = tx.objectStore(st);
            const cursorReq = store.openCursor();
            const results = [];
            cursorReq.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                results.push({ key: cursor.key, value: cursor.value });
                cursor.continue();
              } else {
                d.close();
                resolve(results);
              }
            };
            cursorReq.onerror = () => { d.close(); reject(cursorReq.error); };
          } catch (txErr) {
            d.close();
            reject(txErr);
          }
        };
        req.onerror = () => reject(req.error);
      });
    }, [dbName, storeName]);

    state.idbRecords = records || [];
    state.selectedStore = storeName;
    // Make sure selectedDB has the store list
    if (state.selectedDB && state.selectedDB.name === dbName && !state.selectedDB._stores) {
      state.selectedDB._stores = [{ name: storeName }];
    }
    renderIDBTree();
    renderIDBRecords();
  } catch (e) {
    recordsDiv.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

function renderIDBRecords() {
  const div = $('#idb-records');
  if (state.idbRecords.length === 0) {
    div.innerHTML = '<div class="empty-state"><p>El store está vacío.</p></div>';
    return;
  }

  let html = `<div class="table-wrap"><table><thead><tr><th>Clave</th><th>Valor</th><th></th></tr></thead><tbody>`;
  state.idbRecords.forEach((rec, i) => {
    const keyStr = typeof rec.key === 'object' ? JSON.stringify(rec.key) : String(rec.key);
    const valStr = typeof rec.value === 'object' ? JSON.stringify(rec.value, null, 1) : String(rec.value);
    const valShort = valStr.length > 80 ? valStr.slice(0, 80) + '...' : valStr;

    html += `<tr>
      <td class="key-cell" title="${escHtml(keyStr)}">${escHtml(keyStr)}</td>
      <td><div class="val-cell" data-toggle-expand title="${escHtml(valStr)}">${escHtml(valShort)}</div></td>
      <td class="actions-cell">
        <button class="btn btn-sm" data-edit-idb="${i}">Editar</button>
        <button class="btn btn-sm btn-danger" data-del-idb="${i}">X</button>
      </td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  div.innerHTML = html;

  div.querySelectorAll('[data-edit-idb]').forEach(b => {
    b.addEventListener('click', () => showIDBRecordModal(state.idbRecords[+b.dataset.editIdb], false));
  });
  div.querySelectorAll('[data-del-idb]').forEach(b => {
    b.addEventListener('click', () => deleteIDBRecord(state.idbRecords[+b.dataset.delIdb]));
  });
}

function showIDBRecordModal(record, isNew) {
  const dbName = state.selectedDB ? state.selectedDB.name : '';
  const stName = state.selectedStore || '';
  if (!dbName || !stName) { showToast('Selecciona una base de datos y un store primero.', 'error'); return; }

  const title = isNew ? 'Nuevo registro' : 'Editar registro';
  const keyStr = record ? (typeof record.key === 'object' ? JSON.stringify(record.key) : String(record.key)) : '';
  const valStr = record ? (typeof record.value === 'object' ? JSON.stringify(record.value, null, 2) : String(record.value)) : '';

  const html = `<h3>${title}</h3>
    <p>Base de datos: <strong>${escHtml(dbName)}</strong> &middot; Store: <strong>${escHtml(stName)}</strong></p>
    <div class="form-group"><label>Clave ${isNew ? '(dejar vacío para auto-generada)' : ''}</label>
      <input id="idb-key" value="${escHtml(keyStr)}" ${!isNew ? 'readonly' : ''}/>
    </div>
    <div class="form-group"><label>Valor (JSON)</label><textarea id="idb-value" rows="6">${escHtml(valStr)}</textarea></div>
    <div class="form-actions">
      <button class="btn" data-action="close">Cancelar</button>
      <button class="btn btn-primary" id="idb-save">Guardar</button>
    </div>`;

  showModal(html);

  $('#idb-save').addEventListener('click', async () => {
    const newKey = $('#idb-key').value.trim();
    const rawVal = $('#idb-value').value.trim();
    let parsedVal;
    try {
      parsedVal = rawVal ? JSON.parse(rawVal) : '';
    } catch (e) {
      showToast('Valor JSON inválido: ' + e.message, 'error');
      return;
    }

    try {
      if (isNew) {
        const keyArg = newKey || undefined;
        const keyToUse = keyArg ? (() => { try { return JSON.parse(keyArg); } catch { return keyArg; } })() : undefined;
        await execInTab((db, st, val, k) => {
          return new Promise((resolve, reject) => {
            const req = indexedDB.open(db);
            req.onsuccess = (e) => {
              const d = e.target.result;
              const tx = d.transaction(st, 'readwrite');
              const store = tx.objectStore(st);
              const addReq = k !== undefined ? store.add(val, k) : store.add(val);
              addReq.onsuccess = () => { d.close(); resolve(true); };
              addReq.onerror = () => { d.close(); reject(addReq.error); };
            };
            req.onerror = () => reject(req.error);
          });
        }, [dbName, stName, parsedVal, keyToUse]);
      } else {
        const existingKey = record.key;
        await execInTab((db, st, val, k) => {
          return new Promise((resolve, reject) => {
            const req = indexedDB.open(db);
            req.onsuccess = (e) => {
              const d = e.target.result;
              const tx = d.transaction(st, 'readwrite');
              const store = tx.objectStore(st);
              const putReq = store.put(val, k);
              putReq.onsuccess = () => { d.close(); resolve(true); };
              putReq.onerror = () => { d.close(); reject(putReq.error); };
            };
            req.onerror = () => reject(req.error);
          });
        }, [dbName, stName, parsedVal, existingKey]);
      }

      closeModal();
      showToast(isNew ? 'Registro añadido.' : 'Registro actualizado.');
      loadRecords(dbName, stName);
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  });
}

async function deleteIDBRecord(record) {
  const dbName = state.selectedDB ? state.selectedDB.name : '';
  const stName = state.selectedStore || '';
  if (!dbName || !stName) return;

  const keyStr = typeof record.key === 'object' ? JSON.stringify(record.key) : String(record.key);
  if (!confirm('Eliminar registro con clave "' + keyStr + '"?')) return;

  try {
    await execInTab((db, st, key) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(db);
        req.onsuccess = (e) => {
          const d = e.target.result;
          const tx = d.transaction(st, 'readwrite');
          const store = tx.objectStore(st);
          const delReq = store.delete(key);
          delReq.onsuccess = () => { d.close(); resolve(true); };
          delReq.onerror = () => { d.close(); reject(delReq.error); };
        };
        req.onerror = () => reject(req.error);
      });
    }, [dbName, stName, record.key]);

    showToast('Registro eliminado.');
    loadRecords(dbName, stName);
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function showAddIDBRecord() {
  if (!state.selectedDB || !state.selectedStore) {
    showToast('Selecciona una base de datos y un store primero.', 'info');
    return;
  }
  showIDBRecordModal(null, true);
}

async function exportIDBAll() {
  if (!state.selectedDB) { showToast('Selecciona una base de datos primero.', 'info'); return; }
  const dbName = state.selectedDB.name;
  try {
    const result = await execInTab((dbName) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = (e) => {
          const d = e.target.result;
          const version = d.version;
          const storeNames = Array.from(d.objectStoreNames);
          const output = { name: dbName, version, stores: {} };

          if (storeNames.length === 0) { d.close(); resolve(output); return; }

          let pending = storeNames.length;
          storeNames.forEach((st) => {
            const tx = d.transaction(st, 'readonly');
            const store = tx.objectStore(st);
            const cursorReq = store.openCursor();
            const records = [];
            cursorReq.onsuccess = (e) => {
              const cursor = e.target.result;
              if (cursor) {
                records.push({ key: cursor.key, value: cursor.value });
                cursor.continue();
              } else {
                output.stores[st] = records;
                pending--;
                if (pending === 0) { d.close(); resolve(output); }
              }
            };
            cursorReq.onerror = () => { d.close(); reject(cursorReq.error); };
          });
        };
        req.onerror = () => reject(req.error);
      });
    }, [dbName]);

    copyOrDownload(JSON.stringify(result, null, 2), dbName + '.json');
    showToast('Base de datos exportada.');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

async function exportIDBStore() {
  if (!state.selectedDB || !state.selectedStore) { showToast('Selecciona un store primero.', 'info'); return; }
  const dbName = state.selectedDB.name;
  const stName = state.selectedStore;

  try {
    const result = await execInTab((db, st) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(db);
        req.onsuccess = (e) => {
          const d = e.target.result;
          const tx = d.transaction(st, 'readonly');
          const store = tx.objectStore(st);
          const cursorReq = store.openCursor();
          const records = [];
          cursorReq.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              records.push({ key: cursor.key, value: cursor.value });
              cursor.continue();
            } else {
              d.close();
              resolve({ name: db, store: st, records });
            }
          };
          cursorReq.onerror = () => { d.close(); reject(cursorReq.error); };
        };
        req.onerror = () => reject(req.error);
      });
    }, [dbName, stName]);

    copyOrDownload(JSON.stringify(result, null, 2), stName + '.json');
    showToast('Store exportado.');
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

function showImportIDB() {
  if (!state.selectedDB) { showToast('Selecciona una base de datos primero.', 'info'); return; }
  const dbName = state.selectedDB.name;

  showModal(`<h3>Importar a IndexedDB</h3>
    <p>Base de datos: <strong>${escHtml(dbName)}</strong>. Pega el JSON exportado.</p>
    <div class="form-group"><textarea id="import-json" rows="8" placeholder='{"name":"${escHtml(dbName)}","version":1,"stores":{"miStore":[{"key":1,"value":{"dato":"ejemplo"}}]}}'></textarea></div>
    <div class="checkbox-group">
      <label><input type="checkbox" id="import-idb-clear"> Limpiar stores antes de importar</label>
    </div>
    <div class="form-actions">
      <button class="btn" data-action="close">Cancelar</button>
      <button class="btn btn-primary" id="import-exec">Importar</button>
    </div>`);

  $('#import-exec').addEventListener('click', async () => {
    const raw = $('#import-json').value.trim();
    if (!raw) { showToast('Pega el JSON primero.', 'error'); return; }
    let data;
    try { data = JSON.parse(raw); } catch (e) { showToast('JSON inválido: ' + e.message, 'error'); return; }
    const shouldClear = $('#import-idb-clear').checked;

    try {
      const result = await execInTab((jsonStr, clear) => {
        const data = JSON.parse(jsonStr);
        const dbName = data.name;
        let stores = data.stores;
        if (!stores && data.store && Array.isArray(data.records)) {
          stores = { [data.store]: data.records };
        }
        const storeNames = Object.keys(stores || {});

        return new Promise((resolve, reject) => {
          try {
            const checkReq = indexedDB.open(dbName);

            checkReq.onsuccess = (e) => {
              const d = e.target.result;
              const currentVer = d.version;
              const existingStores = Array.from(d.objectStoreNames);
              d.close();

              const needsUpgrade = storeNames.some(s => !existingStores.includes(s));
              const newVersion = needsUpgrade ? currentVer + 1 : currentVer;

              const openReq = indexedDB.open(dbName, newVersion);

              openReq.onupgradeneeded = (e) => {
                const db = e.target.result;
                storeNames.forEach(sName => {
                  if (!db.objectStoreNames.contains(sName)) {
                    db.createObjectStore(sName, { autoIncrement: true });
                  }
                });
              };

              openReq.onsuccess = (e) => {
                const db = e.target.result;
                if (storeNames.length === 0) {
                  db.close();
                  resolve({ success: true, count: 0 });
                  return;
                }

                const tx = db.transaction(storeNames, 'readwrite');

                if (clear) {
                  storeNames.forEach(sName => {
                    if (db.objectStoreNames.contains(sName)) {
                      tx.objectStore(sName).clear();
                    }
                  });
                }

                let total = 0;
                storeNames.forEach(sName => {
                  const store = tx.objectStore(sName);
                  const hasKeyPath = store.keyPath !== null;
                  const records = stores[sName] || [];
                  records.forEach(rec => {
                    total++;
                    try {
                      if (hasKeyPath) {
                        store.put(rec.value);
                      } else if (rec.key !== undefined) {
                        store.put(rec.value, rec.key);
                      } else {
                        store.put(rec.value);
                      }
                    } catch (putErr) {
                      console.warn('put error:', putErr);
                    }
                  });
                });

                tx.oncomplete = () => {
                  db.close();
                  resolve({ success: true, count: total, stores: storeNames });
                };

                tx.onerror = () => { db.close(); reject(tx.error || new Error('Error en transaccion')); };
                tx.onabort = () => { db.close(); reject(new Error('Transaccion abortada')); };
              };

              openReq.onerror = () => reject(openReq.error);
              openReq.onblocked = () => reject(new Error('Base de datos bloqueada. Cierra otras pestanas.'));
            };

            checkReq.onerror = () => reject(checkReq.error || new Error('No se pudo abrir la base de datos'));
            checkReq.onblocked = () => reject(new Error('Base de datos bloqueada.'));
          } catch (err) {
            reject(err);
          }
        });
      }, [raw, shouldClear]);

      closeModal();
      showToast(`Importacion completada: ${result.count} registros.`);

      const importedStore = result.stores && result.stores.length > 0 ? result.stores[0] : null;

      await loadIndexedDB();

      if (importedStore) {
        const db = state.idbDatabases.find(d => d.name === dbName);
        if (db) {
          await loadStores(db);
          await loadRecords(dbName, importedStore);
        }
      }
    } catch (e) {
      showToast('Error: ' + e.message, 'error');
    }
  });
}

async function deleteIDB() {
  if (!state.selectedDB) { showToast('Selecciona una base de datos primero.', 'info'); return; }
  const dbName = state.selectedDB.name;
  if (!confirm('Eliminar permanentemente la base de datos "' + dbName + '"? Esta acción no se puede deshacer.')) return;

  try {
    await execInTab((name) => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('La base de datos está bloqueada. Cierra otras pestañas que la usen.'));
      });
    }, [dbName]);

    showToast('Base de datos eliminada.');
    state.selectedDB = null;
    state.selectedStore = null;
    state.idbRecords = [];
    loadIndexedDB();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

/* ==============================
   SHARED EXPORT UTILITY
   ============================== */
function copyOrDownload(text, filename) {
  showModal(`<h3>Exportar</h3>
    <p>Archivo: <strong>${escHtml(filename)}</strong></p>
    <div class="form-group"><textarea rows="8" readonly style="font-family:var(--font-mono);font-size:11px">${escHtml(text)}</textarea></div>
    <div class="form-actions">
      <button class="btn" id="export-copy">Copiar al portapapeles</button>
      <button class="btn btn-primary" id="export-download">Descargar</button>
      <button class="btn" data-action="close">Cerrar</button>
    </div>`);

  $('#export-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copiado al portapapeles.');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast('Copiado al portapapeles.');
    }
  });

  $('#export-download').addEventListener('click', () => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Descargado: ' + filename);
  });
}

/* ==============================
   INIT
   ============================== */
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('http')) {
    document.body.innerHTML = '<div class="empty-state" style="padding:60px 20px"><h3 style="font-size:28px;margin-bottom:10px">StorageEditor</h3><p style="color:var(--text-secondary)">Esta extensión solo funciona en páginas web (http/https).</p><p style="font-size:11px;margin-top:8px;color:var(--text-muted)">Abre una página web y vuelve a hacer clic en el icono.</p></div>';
    return;
  }
  state.tabUrl = tab.url;
  state.tabId = tab.id;
  state.cookieStoreId = tab.cookieStoreId || null;
  initTheme();
  setupTabs();
  switchTab('cookies');
}

document.addEventListener('DOMContentLoaded', init);

/* ==============================
   THEME TOGGLE
   ============================== */
function initTheme() {
  const saved = localStorage.getItem('storageditor-theme');
  const isLight = saved === 'light';
  document.body.classList.toggle('light', isLight);
  updateThemeBtn(isLight);
  $('#theme-toggle').addEventListener('click', toggleTheme);
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light');
  localStorage.setItem('storageditor-theme', isLight ? 'light' : 'dark');
  updateThemeBtn(isLight);
}

function updateThemeBtn(isLight) {
  const btn = $('#theme-toggle');
  if (btn) btn.textContent = isLight ? '\u263E' : '\u2600';
}

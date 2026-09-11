const DATA_PATH = 'data/items.json';
const CREDENTIALS_PATH = 'data/credentials.json';
let items = [];
let currentSha = null;
let editingId = null;
let loggedUser = null;
let pendingImageFile = null;

const el = id => document.getElementById(id);
const statusBox = el('status');
const loginStatusBox = el('login-status');

function showStatus(box, msg, type = 'info') {
  box.textContent = msg;
  box.className = `status-msg show ${type}`;
}
function clearStatus(box) {
  box.className = 'status-msg';
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Login ----------

el('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = el('login-user').value.trim().toLowerCase();
  const pass = el('login-pass').value;
  try {
    const res = await fetch(CREDENTIALS_PATH, { cache: 'no-store' });
    const credentials = await res.json();
    const hash = await sha256(pass);
    const match = credentials.find(c => c.usuario.toLowerCase() === usuario && c.hash === hash);
    if (!match) {
      showStatus(loginStatusBox, 'Usuario o contraseña incorrectos.', 'error');
      return;
    }
    loggedUser = match;
    sessionStorage.setItem('inv-logged-user', JSON.stringify(match));
    enterAdmin();
  } catch (err) {
    showStatus(loginStatusBox, 'No se pudo verificar las credenciales: ' + err.message, 'error');
  }
});

el('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('inv-logged-user');
  loggedUser = null;
  el('admin-screen').style.display = 'none';
  el('login-screen').style.display = 'block';
  el('login-form').reset();
});

function enterAdmin() {
  el('login-screen').style.display = 'none';
  el('admin-screen').style.display = 'block';
  el('logged-user-label').textContent = loggedUser.nombre || loggedUser.usuario;
  if (['rector', 'jhon', 'yerly'].includes(loggedUser.usuario)) {
    el('f-funcionario').value = loggedUser.usuario;
  }
  initAdminData();
}

// ---------- Configuración GitHub ----------

function loadConfig() {
  const remembered = localStorage.getItem('inv-config');
  if (remembered) {
    const cfg = JSON.parse(remembered);
    el('cfg-owner').value = cfg.owner || '';
    el('cfg-repo').value = cfg.repo || '';
    el('cfg-branch').value = cfg.branch || 'main';
    el('cfg-remember').checked = true;
  }
  const sessionToken = sessionStorage.getItem('inv-token');
  if (sessionToken) el('cfg-token').value = sessionToken;
}

function getConfig() {
  return {
    owner: el('cfg-owner').value.trim(),
    repo: el('cfg-repo').value.trim(),
    branch: el('cfg-branch').value.trim() || 'main',
    token: el('cfg-token').value.trim(),
  };
}

function persistConfigIfNeeded() {
  const cfg = getConfig();
  sessionStorage.setItem('inv-token', cfg.token);
  if (el('cfg-remember').checked) {
    localStorage.setItem('inv-config', JSON.stringify({
      owner: cfg.owner, repo: cfg.repo, branch: cfg.branch
    }));
  } else {
    localStorage.removeItem('inv-config');
  }
}

function contentsUrl(cfg, path) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
}

// ---------- Lectura / escritura del JSON ----------

async function fetchItemsFromGitHub() {
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    showStatus(statusBox, 'Completa usuario, repositorio y token en «Configuración de conexión» para cargar y guardar en vivo. Mostrando data/items.json local mientras tanto.', 'info');
    const res = await fetch(DATA_PATH, { cache: 'no-store' });
    return { data: await res.json(), sha: null };
  }
  const res = await fetch(`${contentsUrl(cfg, DATA_PATH)}?ref=${cfg.branch}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) {
    throw new Error(`No se pudo leer el archivo desde GitHub (${res.status}). Revisa usuario/repo/token.`);
  }
  const json = await res.json();
  const content = decodeURIComponent(escape(atob(json.content)));
  clearStatus(statusBox);
  return { data: JSON.parse(content), sha: json.sha };
}

async function commitItemsToGitHub(newItems, message) {
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    throw new Error('Falta configurar usuario, repositorio o token de GitHub.');
  }
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(newItems, null, 2) + '\n')));
  const body = { message, content, branch: cfg.branch };
  if (currentSha) body.sha = currentSha;

  const res = await fetch(contentsUrl(cfg, DATA_PATH), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error al guardar el inventario (${res.status})`);
  }
  const json = await res.json();
  currentSha = json.content.sha;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file, funcionario, itemId) {
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo || !cfg.token) {
    throw new Error('Falta configurar el token de GitHub para subir fotos.');
  }
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `fotos_inventario/${funcionario}/${itemId}.${ext}`;
  const base64 = await fileToBase64(file);

  // Revisa si ya existe una foto con ese nombre, para poder sobrescribirla
  let existingSha = null;
  const check = await fetch(`${contentsUrl(cfg, path)}?ref=${cfg.branch}`, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
  });
  if (check.ok) existingSha = (await check.json()).sha;

  const body = {
    message: `Subir foto de ítem ${itemId}`,
    content: base64,
    branch: cfg.branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(contentsUrl(cfg, path), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error al subir la foto (${res.status})`);
  }
  return path;
}

// ---------- Render de la tabla ----------

function tipoBadgeClass(tipo) {
  return 'badge ' + (tipo || '').toLowerCase();
}

function renderTable() {
  const tbody = el('rows');
  el('count').textContent = `${items.length} ítems`;

  if (!items.length) {
    tbody.innerHTML = `<tr><td class="empty" colspan="6">Aún no hay ítems. Añade el primero arriba.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(it => `
    <tr>
      <td>${it.imagen ? `<img class="thumb" src="${it.imagen}" alt="" onerror="this.style.display='none'">` : `<div class="thumb thumb-empty"></div>`}</td>
      <td class="id">${it.id}</td>
      <td>${it.descripcion}</td>
      <td><span class="${tipoBadgeClass(it.tipo_inventario)}">${it.tipo_inventario}</span></td>
      <td>${it.funcionario}</td>
      <td class="row-actions">
        <button type="button" class="ghost" data-edit="${it.id}">Editar</button>
        <button type="button" class="danger" data-delete="${it.id}">Eliminar</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => startEdit(btn.dataset.edit)));
  tbody.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteItem(btn.dataset.delete)));
}

function startEdit(id) {
  const it = items.find(x => x.id === id);
  if (!it) return;
  editingId = id;
  pendingImageFile = null;
  el('item-original-id').value = id;
  el('f-id').value = it.id;
  el('f-descripcion').value = it.descripcion;
  el('f-ubicacion').value = it.ubicacion || '';
  el('f-observacion').value = it.observacion || '';
  el('f-tipo').value = it.tipo_inventario;
  el('f-funcionario').value = it.funcionario;
  el('f-imagen').value = '';
  el('imagen-actual').textContent = it.imagen ? `Foto actual: ${it.imagen}` : 'Sin foto';
  el('form-title').textContent = `Editando ${it.id}`;
  el('save-btn').textContent = 'Guardar cambios';
  el('cancel-edit').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  pendingImageFile = null;
  el('item-form').reset();
  if (loggedUser && ['rector', 'jhon', 'yerly'].includes(loggedUser.usuario)) {
    el('f-funcionario').value = loggedUser.usuario;
  }
  el('imagen-actual').textContent = '';
  el('form-title').textContent = 'Añadir ítem';
  el('save-btn').textContent = 'Guardar ítem';
  el('cancel-edit').style.display = 'none';
}

async function deleteItem(id) {
  if (!confirm(`¿Eliminar el ítem ${id}? Esto hace un commit inmediato (la foto asociada no se borra automáticamente).`)) return;
  const updated = items.filter(x => x.id !== id);
  try {
    showStatus(statusBox, 'Guardando…', 'info');
    await commitItemsToGitHub(updated, `Eliminar ítem ${id} del inventario`);
    items = updated;
    renderTable();
    showStatus(statusBox, `Ítem ${id} eliminado y guardado en GitHub.`, 'ok');
  } catch (err) {
    showStatus(statusBox, err.message, 'error');
  }
}

el('f-imagen').addEventListener('change', (e) => {
  pendingImageFile = e.target.files[0] || null;
});

el('item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = el('f-id').value.trim();
  const funcionario = el('f-funcionario').value;

  const newItem = {
    id,
    descripcion: el('f-descripcion').value.trim(),
    ubicacion: el('f-ubicacion').value.trim(),
    observacion: el('f-observacion').value.trim(),
    tipo_inventario: el('f-tipo').value,
    funcionario,
    imagen: editingId ? (items.find(x => x.id === editingId)?.imagen || '') : '',
  };

  const isNew = !editingId;
  if (isNew && items.some(x => x.id === id)) {
    showStatus(statusBox, `Ya existe un ítem con el número ${id}.`, 'error');
    return;
  }

  try {
    showStatus(statusBox, pendingImageFile ? 'Subiendo foto…' : 'Guardando…', 'info');
    persistConfigIfNeeded();

    if (pendingImageFile) {
      newItem.imagen = await uploadImage(pendingImageFile, funcionario, id);
    }

    let updated, message;
    if (isNew) {
      updated = [...items, newItem];
      message = `Añadir ítem ${id} al inventario`;
    } else {
      updated = items.map(x => x.id === editingId ? newItem : x);
      message = `Editar ítem ${id} en el inventario`;
    }

    showStatus(statusBox, 'Guardando inventario…', 'info');
    await commitItemsToGitHub(updated, message);
    items = updated;
    renderTable();
    resetForm();
    showStatus(statusBox, 'Cambios guardados en GitHub.', 'ok');
  } catch (err) {
    showStatus(statusBox, err.message, 'error');
  }
});

el('cancel-edit').addEventListener('click', resetForm);

// ---------- Arranque ----------

async function initAdminData() {
  loadConfig();
  try {
    const { data, sha } = await fetchItemsFromGitHub();
    items = data;
    currentSha = sha;
    renderTable();
  } catch (err) {
    showStatus(statusBox, err.message, 'error');
  }
}

(function initLogin() {
  const remembered = sessionStorage.getItem('inv-logged-user');
  if (remembered) {
    loggedUser = JSON.parse(remembered);
    enterAdmin();
  }
})();

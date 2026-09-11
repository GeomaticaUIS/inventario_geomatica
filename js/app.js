// js/app.js · Aplicación Unificada de Inventario y Planos con Permisos en Sitio (Geomática UIS)

// =========================================================================
// 1. ESTADO GLOBAL DE LA APLICACIÓN
// =========================================================================
let allItems = [];
let allSalas = [];
let allUsers = [];
let currentUser = null; // null si es invitado; objeto { id, usuario, nombre, rol } si está autenticado
let currentSalaId = null;
let currentView = 'tabla'; // 'tabla' | 'mapa' | 'designer'
let activeKpiFilter = ''; // '' | 'MAYOR' | 'MENOR' | 'INTANGIBLE' | 'PLANO'

// Estado del Visor de Planos 2D (Leaflet Indoor)
let indoorMap = null;
let mapImageOverlay = null;
let mapMarkers = [];

// Estado del Asignador de Pines en el Modal de Ítems (Leaflet)
let adminMap = null;
let adminImageOverlay = null;
let adminMarker = null;
let currentAdminSala = null;
let itemPhotoToUpload = null;
let currentItemPhotoUrl = '';

// Estado del Diseñador Visual de Planos 2D
let canvasElements = [];
let selectedElementId = null;
let nextElementId = 1;
let editingSalaId = null;
let canvasZoom = 1.0;

// Generador y validador de IDs únicos para elementos del lienzo (evita selección múltiple y colisiones)
function getNextElementId() {
  let maxId = 0;
  canvasElements.forEach(item => {
    if (item && typeof item.id === 'string') {
      const match = item.id.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    }
  });
  nextElementId = Math.max(nextElementId, maxId + 1);
  while (canvasElements.some(item => item && item.id === `elem_${nextElementId}`)) {
    nextElementId++;
  }
  return `elem_${nextElementId++}`;
}

function ensureUniqueElementIds() {
  const seen = new Set();
  let maxId = 0;
  canvasElements.forEach(item => {
    if (item && typeof item.id === 'string') {
      const match = item.id.match(/(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxId) maxId = num;
      }
    }
  });
  nextElementId = Math.max(nextElementId, maxId + 1);

  canvasElements.forEach(item => {
    if (!item) return;
    if (!item.id || seen.has(item.id)) {
      while (seen.has(`elem_${nextElementId}`) || canvasElements.some(x => x && x.id === `elem_${nextElementId}`)) {
        nextElementId++;
      }
      item.id = `elem_${nextElementId++}`;
    }
    seen.add(item.id);
  });
}


const el = id => document.getElementById(id);

// Utilidad para escapar texto HTML y prevenir XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function tipoBadgeClass(tipo) {
  return 'badge ' + (tipo || '').toLowerCase();
}

// Sistema de Notificaciones Toasts Flotantes
function showToast(msg, type = 'ok') {
  const container = el('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-body">${escapeHtml(msg)}</div>
    <button type="button" class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }
  }, 3500);
}

// =========================================================================
// 2. GESTIÓN DE SESIÓN, ROLES Y PERMISOS EN SITIO
// =========================================================================

function initAuth() {
  const stored = sessionStorage.getItem('inv-auth-user');
  if (stored) {
    try {
      currentUser = JSON.parse(stored);
    } catch {
      currentUser = null;
      sessionStorage.removeItem('inv-auth-user');
    }
  }
  updateAuthUI();
}

function hasEditPermission() {
  return currentUser !== null; // admin o editor tienen permisos de gestión
}

function updateAuthUI() {
  const isAuth = hasEditPermission();

  const guestControls = el('guest-header-controls');
  const authControls = el('auth-header-controls');
  const btnDesigner = el('btn-view-designer');
  const btnAddItem = el('btn-open-create-item');
  const btnEditRoomPlan = el('btn-edit-room-plan');
  const authTableCols = document.querySelectorAll('.auth-table-col');

  if (isAuth) {
    if (guestControls) guestControls.style.display = 'none';
    if (authControls) authControls.style.display = 'inline-flex';

    if (el('user-display-name')) el('user-display-name').textContent = currentUser.nombre;
    if (el('user-display-role')) {
      el('user-display-role').textContent = (currentUser.rol === 'admin') ? 'Administrador' : 'Editor';
    }

    if (btnDesigner) btnDesigner.style.display = 'inline-flex';
    if (btnAddItem) btnAddItem.style.display = 'inline-flex';
    if (btnEditRoomPlan) btnEditRoomPlan.style.display = 'inline-block';
    authTableCols.forEach(c => c.style.display = 'table-cell');
  } else {
    if (guestControls) guestControls.style.display = 'inline-flex';
    if (authControls) authControls.style.display = 'none';

    if (btnDesigner) btnDesigner.style.display = 'none';
    if (btnAddItem) btnAddItem.style.display = 'none';
    if (btnEditRoomPlan) btnEditRoomPlan.style.display = 'none';
    authTableCols.forEach(c => c.style.display = 'none');

    // Si el usuario estaba en la pestaña del diseñador y cerró sesión, volver a tabla
    if (currentView === 'designer') {
      switchView('tabla');
    }
  }

  // Refrescar la tabla para mostrar u ocultar botones de acción en filas
  renderTable();
}

// Modal de Inicio de Sesión
window.openLoginModal = function() {
  el('login-form').reset();
  const st = el('login-status');
  if (st) st.className = 'status-msg';
  el('login-modal').classList.add('show');
};

window.closeLoginModal = function() {
  el('login-modal').classList.remove('show');
};

window.fillLoginUser = function(user) {
  el('login-user').value = user;
  el('login-pass').value = 'cambiar123';
  showToast(`Credenciales asignadas para "${user}". Presiona Entrar.`, 'info');
};

el('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = el('login-user').value.trim();
  const password = el('login-pass').value;

  const statusBox = el('login-status');
  if (statusBox) {
    statusBox.textContent = 'Verificando credenciales…';
    statusBox.className = 'status-msg show info';
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Usuario o contraseña incorrectos');
    }

    currentUser = data.user;
    sessionStorage.setItem('inv-auth-user', JSON.stringify(currentUser));
    closeLoginModal();
    updateAuthUI();
    showToast(`¡Bienvenido al sistema, ${currentUser.nombre}!`, 'ok');
  } catch (err) {
    if (statusBox) {
      statusBox.textContent = err.message;
      statusBox.className = 'status-msg show error';
    }
  }
});

function logout() {
  sessionStorage.removeItem('inv-auth-user');
  currentUser = null;
  updateAuthUI();
  showToast('Has cerrado sesión. Modo consulta activado.', 'info');
}

el('btn-open-login')?.addEventListener('click', openLoginModal);
el('btn-logout')?.addEventListener('click', logout);

// =========================================================================
// 3. CARGA DE DATOS DESDE LA API LOCAL
// =========================================================================

async function loadData() {
  const [resItems, resSalas] = await Promise.all([
    fetch('/api/items', { cache: 'no-store' }),
    fetch('/api/salas', { cache: 'no-store' })
  ]);

  if (!resItems.ok || !resSalas.ok) {
    throw new Error('Error conectando con la API del servidor');
  }

  allItems = await resItems.json();
  allSalas = await resSalas.json();

  if (allSalas.length > 0 && !currentSalaId) {
    currentSalaId = allSalas[0].id;
  }

  updateKpiDashboard();
}

// Mini-Dashboard de Estadísticas
function updateKpiDashboard() {
  const total = allItems.length;
  const mayor = allItems.filter(x => (x.tipo_inventario || '').toUpperCase() === 'MAYOR').length;
  const menor = allItems.filter(x => (x.tipo_inventario || '').toUpperCase() === 'MENOR').length;
  const intangible = allItems.filter(x => (x.tipo_inventario || '').toUpperCase() === 'INTANGIBLE').length;
  const plano = allItems.filter(x => x.sala_id && x.pos_x !== null && x.pos_y !== null).length;

  const setVal = (id, val) => {
    const node = el(id);
    if (node) node.textContent = val;
  };

  setVal('kpi-total', total);
  setVal('kpi-mayor', mayor);
  setVal('kpi-menor', menor);
  setVal('kpi-intangible', intangible);
  setVal('kpi-plano', plano);
}

// Filtros Rápidos desde las Tarjetas KPI
window.quickFilterType = function(tipo) {
  activeKpiFilter = tipo;
  const selTipo = el('filter-tipo');
  if (selTipo) selTipo.value = tipo;

  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
  if (tipo === 'MAYOR') el('kpi-card-mayor')?.classList.add('active');
  else if (tipo === 'MENOR') el('kpi-card-menor')?.classList.add('active');
  else if (tipo === 'INTANGIBLE') el('kpi-card-intangible')?.classList.add('active');
  else el('kpi-card-all')?.classList.add('active');

  renderTable();
};

window.quickFilterPlano = function() {
  activeKpiFilter = (activeKpiFilter === 'PLANO') ? '' : 'PLANO';
  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
  if (activeKpiFilter === 'PLANO') {
    el('kpi-card-plano')?.classList.add('active');
  } else {
    el('kpi-card-all')?.classList.add('active');
  }
  renderTable();
};

// =========================================================================
// 4. TABLA DE INVENTARIO Y ACCIONES CONTEXTUALES
// =========================================================================

function renderTable() {
  const tbody = el('rows');
  if (!tbody) return;

  const search = el('search')?.value.trim().toLowerCase() || '';
  const tipo = el('filter-tipo')?.value.trim().toUpperCase() || '';
  const funcionario = el('filter-funcionario')?.value || '';
  const sala = el('filter-sala')?.value || '';

  const isAuth = hasEditPermission();

  const filtered = allItems.filter(it => {
    const itTipo = (it.tipo_inventario || '').toUpperCase();
    const matchesSearch = !search || [it.id, it.descripcion, it.ubicacion, it.observacion, it.funcionario, it.sala_nombre]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(search));
    
    const matchesTipo = !tipo || itTipo === tipo;
    const matchesFuncionario = !funcionario || it.funcionario === funcionario;
    const matchesSala = !sala || it.sala_id === sala;
    const matchesPlano = (activeKpiFilter !== 'PLANO') || (it.sala_id && it.pos_x !== null && it.pos_y !== null);

    return matchesSearch && matchesTipo && matchesFuncionario && matchesSala && matchesPlano;
  });

  const countEl = el('count');
  if (countEl) countEl.textContent = `${filtered.length} de ${allItems.length} ítems`;

  if (!filtered.length) {
    const colSpan = isAuth ? 8 : 7;
    tbody.innerHTML = `
      <tr>
        <td class="empty" colspan="${colSpan}" style="text-align:center;padding:32px 16px;color:var(--text-soft)">
          <div style="font-size:1.6rem;margin-bottom:6px">🔍</div>
          <strong>No se encontraron equipos</strong> con los filtros seleccionados.<br>
          <button type="button" class="btn-clear-filters" style="margin-top:10px" onclick="clearFilters()">Restablecer filtros</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(it => {
    const salaBadge = it.sala_nombre
      ? `<span class="badge-sala">📍 ${escapeHtml(it.sala_nombre)}</span>`
      : '';

    const btnPlano = (it.sala_id && it.pos_x !== null && it.pos_y !== null)
      ? `<button type="button" class="button ghost" style="padding:4px 8px;font-size:0.78rem" onclick="focusItemOnMap('${escapeHtml(String(it.id))}')">📍 Ver</button>`
      : `<span style="color:var(--text-soft);font-size:0.8rem">—</span>`;

    // Acciones de edición/borrado solo se añaden si el usuario tiene permisos
    const actionsCell = isAuth
      ? `
        <td style="text-align:center">
          <div class="row-actions" style="justify-content:center">
            <button type="button" class="button ghost table-action-btn" onclick="startEditItem('${escapeHtml(String(it.id))}')">✏️ Editar</button>
            <button type="button" class="button danger table-action-btn" onclick="deleteItem('${escapeHtml(String(it.id))}')">🗑️</button>
          </div>
        </td>
      `
      : '';

    return `
      <tr>
        <td>${thumb(it)}</td>
        <td class="id-cell">
          <span>${escapeHtml(String(it.id))}</span>
          <button type="button" class="copy-id-btn" title="Copiar código" onclick="copyInventoryId('${escapeHtml(String(it.id))}', event)">📋</button>
        </td>
        <td>
          <strong style="color:var(--text-main)">${escapeHtml(it.descripcion)}</strong>
          ${it.observacion ? `<br><span style="color:var(--text-soft);font-size:0.82rem">${escapeHtml(it.observacion)}</span>` : ''}
        </td>
        <td>
          ${escapeHtml(it.ubicacion || '—')}
          ${salaBadge ? `<br>${salaBadge}` : ''}
        </td>
        <td><span class="${tipoBadgeClass(it.tipo_inventario)}">${escapeHtml(it.tipo_inventario)}</span></td>
        <td style="color:var(--text-muted);font-weight:500">${escapeHtml(it.funcionario || '—')}</td>
        <td style="text-align:center">${btnPlano}</td>
        ${actionsCell}
      </tr>
    `;
  }).join('');
}

function thumb(it) {
  const imgUrl = (it.imagen || '').trim();
  if (!imgUrl || imgUrl.endsWith('/') || !imgUrl.includes('.')) {
    return `<div class="thumb thumb-empty" title="Sin foto">N/A</div>`;
  }

  const safeUrl = escapeHtml(imgUrl);
  const safeDesc = escapeHtml(it.descripcion || '');
  const safeId = escapeHtml(String(it.id || ''));

  return `<img class="thumb" src="${safeUrl}" alt="${safeDesc}" loading="lazy"
               onclick="openPhotoModal('${safeUrl}', '${safeId} - ${safeDesc}')"
               onerror="this.outerHTML='<div class=&quot;thumb thumb-empty&quot;>N/A</div>'">`;
}

window.copyInventoryId = function(id, e) {
  if (e) e.stopPropagation();
  navigator.clipboard.writeText(String(id)).then(() => {
    showToast(`No. de inventario ${id} copiado al portapapeles`, 'ok');
  }).catch(() => {
    showToast(`Código: ${id}`, 'info');
  });
};

function populateFilters() {
  const selFunc = el('filter-funcionario');
  selFunc.innerHTML = '<option value="">Todos los responsables</option>';
  const funcionarios = [...new Set(allItems.map(it => it.funcionario).filter(Boolean))].sort();
  funcionarios.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    selFunc.appendChild(opt);
  });

  const selSala = el('filter-sala');
  selSala.innerHTML = '<option value="">Todas las salas</option>';
  allSalas.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nombre;
    selSala.appendChild(opt);
  });

  const selMapSala = el('map-sala-select');
  selMapSala.innerHTML = '';
  allSalas.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nombre;
    selMapSala.appendChild(opt);
  });
  if (currentSalaId) selMapSala.value = currentSalaId;
}

window.clearFilters = function() {
  el('search').value = '';
  el('filter-tipo').value = '';
  el('filter-funcionario').value = '';
  el('filter-sala').value = '';
  activeKpiFilter = '';
  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
  el('kpi-card-all')?.classList.add('active');
  renderTable();
};

// =========================================================================
// 5. MODAL DE CREACIÓN / EDICIÓN DE ÍTEMS (CRUD CONTEXTUAL)
// =========================================================================

function populateItemModalSelects() {
  const selFunc = el('f-funcionario');
  selFunc.innerHTML = '<option value="">-- Sin responsable asignado --</option>';

  const baseFuncs = ['HERNAN PORRAS', 'JHON CÁCERES', 'YERLY MARTINEZ', 'CARLOS GARCIA'];
  const added = new Set();

  baseFuncs.forEach(f => {
    added.add(f.toUpperCase());
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = (f === 'HERNAN PORRAS') ? 'HERNAN PORRAS (Rector)' : f;
    selFunc.appendChild(opt);
  });

  allItems.forEach(it => {
    const f = (it.funcionario || '').trim();
    if (f && !added.has(f.toUpperCase())) {
      added.add(f.toUpperCase());
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      selFunc.appendChild(opt);
    }
  });

  const selSala = el('f-sala');
  selSala.innerHTML = '<option value="">-- Sin sala asignada --</option>';
  allSalas.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nombre;
    selSala.appendChild(opt);
  });
}

window.openCreateItemModal = function() {
  if (!hasEditPermission()) return;
  populateItemModalSelects();

  el('item-form').reset();
  el('item-original-id').value = '';
  el('f-id').readOnly = false;
  el('f-id').style.backgroundColor = '#fff';
  el('f-tipo').value = 'MAYOR';
  el('f-funcionario').value = '';
  el('f-sala').value = '';
  el('imagen-actual-preview').innerHTML = '';
  currentItemPhotoUrl = '';
  itemPhotoToUpload = null;
  clearAdminMarker();
  el('admin-map-wrapper').style.display = 'none';

  el('item-modal-title').textContent = '➕ Añadir Ítem al Inventario';
  el('save-item-btn').textContent = '💾 Guardar Ítem';
  el('item-modal').classList.add('show');
};

window.startEditItem = function(id) {
  if (!hasEditPermission()) return;
  const it = allItems.find(x => String(x.id) === String(id));
  if (!it) return;

  populateItemModalSelects();

  el('item-original-id').value = it.id;
  el('f-id').value = it.id;
  el('f-id').readOnly = true;
  el('f-id').style.backgroundColor = '#f1f5f9';

  el('f-descripcion').value = it.descripcion;
  el('f-ubicacion').value = it.ubicacion || '';
  el('f-observacion').value = it.observacion || '';

  const tipoNorm = (it.tipo_inventario || 'MAYOR').trim().toUpperCase();
  el('f-tipo').value = ['MAYOR', 'MENOR', 'INTANGIBLE'].includes(tipoNorm) ? tipoNorm : 'MAYOR';

  let funcVal = (it.funcionario || '').trim();
  const funcUpper = funcVal.toUpperCase();
  if (funcUpper === 'RECTOR' || funcUpper.includes('PORRAS')) funcVal = 'HERNAN PORRAS';
  else if (funcUpper === 'JHON' || funcUpper.includes('CACERES') || funcUpper.includes('CÁCERES')) funcVal = 'JHON CÁCERES';
  else if (funcUpper === 'YERLY' || funcUpper.includes('MARTINEZ')) funcVal = 'YERLY MARTINEZ';
  else if (funcUpper === 'CARLOS' || funcUpper.includes('GARCIA')) funcVal = 'CARLOS GARCIA';

  el('f-funcionario').value = funcVal;
  el('f-sala').value = it.sala_id || '';

  currentItemPhotoUrl = it.imagen || '';
  itemPhotoToUpload = null;
  if (it.imagen) {
    el('imagen-actual-preview').innerHTML = `
      <div class="photo-preview-box">
        <img src="${escapeHtml(it.imagen)}" alt="Foto actual">
        <div style="flex:1">
          <strong style="font-size:0.85rem;color:var(--text-main)">Foto actual en servidor</strong>
          <div style="font-size:0.78rem;color:var(--text-soft)">Ruta: ${escapeHtml(it.imagen)}</div>
        </div>
      </div>
    `;
  } else {
    el('imagen-actual-preview').innerHTML = '';
  }

  updateAdminMapForSala(it.sala_id, it.pos_x, it.pos_y);

  el('item-modal-title').textContent = `✏️ Modificar Ítem No. ${it.id}`;
  el('save-item-btn').textContent = '💾 Guardar Cambios';
  el('item-modal').classList.add('show');
};

window.closeItemModal = function() {
  el('item-modal').classList.remove('show');
};

el('btn-open-create-item')?.addEventListener('click', openCreateItemModal);

// Asignador de Coordenadas en Modal de Ítems
function initAdminMapIfNeeded() {
  if (adminMap) return;

  adminMap = L.map('admin-indoor-map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomSnap: 0.25,
    attributionControl: false
  });

  adminMap.on('click', (e) => {
    if (!currentAdminSala) return;
    const h = currentAdminSala.alto || 700;
    const posX = Math.round(e.latlng.lng);
    const posY = Math.round(h - e.latlng.lat);
    setAdminMarkerCoords(posX, posY);
  });
}

function updateAdminMapForSala(salaId, initialX = null, initialY = null) {
  const wrapper = el('admin-map-wrapper');
  if (!salaId) {
    wrapper.style.display = 'none';
    clearAdminMarker();
    return;
  }

  const sala = allSalas.find(s => s.id === salaId);
  if (!sala) {
    wrapper.style.display = 'none';
    return;
  }

  currentAdminSala = sala;
  wrapper.style.display = 'block';

  initAdminMapIfNeeded();

  if (adminImageOverlay) {
    adminMap.removeLayer(adminImageOverlay);
    adminImageOverlay = null;
  }

  const w = sala.ancho || 1000;
  const h = sala.alto || 700;
  const bounds = [[0, 0], [h, w]];

  adminImageOverlay = L.imageOverlay(sala.plano_imagen, bounds).addTo(adminMap);
  adminMap.fitBounds(bounds);

  setTimeout(() => {
    adminMap.invalidateSize();
    adminMap.fitBounds(bounds);
    if (initialX !== null && initialY !== null) {
      setAdminMarkerCoords(initialX, initialY);
    } else {
      clearAdminMarker();
    }
  }, 120);
}

function setAdminMarkerCoords(x, y) {
  if (!currentAdminSala) return;
  const h = currentAdminSala.alto || 700;
  const lat = h - y;
  const lng = x;

  el('f-pos-x').value = x;
  el('f-pos-y').value = y;
  el('coord-display').textContent = `(X: ${x} px, Y: ${y} px)`;

  if (!adminMarker) {
    const customIcon = L.divIcon({
      html: '<div class="custom-pin mayor selected">📍</div>',
      className: 'custom-pin-container',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    adminMarker = L.marker([lat, lng], { icon: customIcon, draggable: true }).addTo(adminMap);

    adminMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      const newX = Math.round(pos.lng);
      const newY = Math.round(h - pos.lat);
      el('f-pos-x').value = newX;
      el('f-pos-y').value = newY;
      el('coord-display').textContent = `(X: ${newX} px, Y: ${newY} px)`;
    });
  } else {
    adminMarker.setLatLng([lat, lng]);
  }
}

function clearAdminMarker() {
  if (adminMarker && adminMap) {
    adminMap.removeLayer(adminMarker);
    adminMarker = null;
  }
  el('f-pos-x').value = '';
  el('f-pos-y').value = '';
  el('coord-display').textContent = 'Sin pin fijado';
}

el('btn-clear-coords')?.addEventListener('click', clearAdminMarker);

el('f-sala')?.addEventListener('change', (e) => {
  updateAdminMapForSala(e.target.value);
});

// Previsualización instantánea de foto con FileReader
const fileInput = el('f-imagen');
const dropZone = el('photo-drop-zone');

function handleFilePreview(file) {
  if (!file || !file.type.startsWith('image/')) return;
  itemPhotoToUpload = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    el('imagen-actual-preview').innerHTML = `
      <div class="photo-preview-box">
        <img src="${e.target.result}" alt="Foto seleccionada">
        <div style="flex:1">
          <strong style="font-size:0.85rem;color:var(--geo-primary)">Nueva foto seleccionada:</strong>
          <div style="font-size:0.78rem;color:var(--text-soft)">${escapeHtml(file.name)} (${Math.round(file.size / 1024)} KB)</div>
        </div>
        <button type="button" class="button ghost" style="padding:2px 8px;font-size:0.75rem;color:#dc2626" onclick="clearPhotoSelection()">✕ Quitar</button>
      </div>
    `;
  };
  reader.readAsDataURL(file);
}

window.clearPhotoSelection = function() {
  fileInput.value = '';
  itemPhotoToUpload = null;
  if (currentItemPhotoUrl) {
    el('imagen-actual-preview').innerHTML = `
      <div class="photo-preview-box">
        <img src="${escapeHtml(currentItemPhotoUrl)}" alt="Foto actual">
        <div style="flex:1">
          <strong style="font-size:0.85rem;color:var(--text-main)">Foto actual en servidor</strong>
        </div>
      </div>
    `;
  } else {
    el('imagen-actual-preview').innerHTML = '';
  }
};

fileInput?.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFilePreview(e.target.files[0]);
});

if (dropZone) {
  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      handleFilePreview(files[0]);
    }
  });
}

// Envío del Formulario de Ítems
el('item-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!hasEditPermission()) return;

  const originalId = el('item-original-id').value;
  const isEditing = originalId !== '';
  const id = el('f-id').value.trim();
  const descripcion = el('f-descripcion').value.trim();
  const ubicacion = el('f-ubicacion').value.trim();
  const observacion = el('f-observacion').value.trim();
  const tipo_inventario = (el('f-tipo').value || 'MAYOR').trim().toUpperCase();
  const funcionario = (el('f-funcionario').value || '').trim();
  const sala_id = el('f-sala').value || null;
  const posXVal = el('f-pos-x').value;
  const posYVal = el('f-pos-y').value;

  const pos_x = posXVal !== '' ? parseFloat(posXVal) : null;
  const pos_y = posYVal !== '' ? parseFloat(posYVal) : null;

  if (!isEditing && allItems.some(x => String(x.id) === id)) {
    showToast(`Ya existe un ítem con el código ${id}. Por favor verifica el número.`, 'error');
    return;
  }

  try {
    showToast('Guardando ítem en la base de datos…', 'info');

    let finalPhotoUrl = currentItemPhotoUrl;
    if (fileInput.files.length > 0) {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

      const uploadRes = await fetch('/api/upload/foto', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) throw new Error('Error al subir la imagen al servidor');
      const uploadData = await uploadRes.json();
      finalPhotoUrl = uploadData.url;
    }

    const payload = {
      id,
      descripcion,
      ubicacion,
      observacion,
      tipo_inventario,
      funcionario,
      imagen: finalPhotoUrl,
      sala_id,
      pos_x,
      pos_y
    };

    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Error al guardar el ítem');
    }

    showToast(`¡Ítem ${id} guardado con éxito!`, 'ok');
    closeItemModal();
    await loadData();
    populateFilters();
    renderTable();

    // Si está en la vista mapa, actualizar
    if (currentView === 'mapa' && currentSalaId) {
      renderSalaOnMap(currentSalaId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Eliminar Ítem
window.deleteItem = async function(id) {
  if (!hasEditPermission()) return;
  if (!confirm(`¿Eliminar definitivamente el ítem ${id} del inventario?`)) return;

  try {
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar el ítem');

    showToast(`Ítem ${id} eliminado del inventario`, 'ok');
    await loadData();
    populateFilters();
    renderTable();

    if (currentView === 'mapa' && currentSalaId) {
      renderSalaOnMap(currentSalaId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// =========================================================================
// 6. VISOR DE PLANOS 2D (INDOOR LEAFLET)
// =========================================================================

function initIndoorMap() {
  if (indoorMap) return;

  indoorMap = L.map('indoor-map', {
    crs: L.CRS.Simple,
    minZoom: -2,
    maxZoom: 2,
    zoomSnap: 0.25,
    attributionControl: false
  });

  renderSalaOnMap(currentSalaId);
}

function centerMapOnBounds() {
  if (!indoorMap || !currentSalaId) return;
  const sala = allSalas.find(s => s.id === currentSalaId);
  if (!sala) return;
  const w = sala.ancho || 1000;
  const h = sala.alto || 700;
  indoorMap.fitBounds([[0, 0], [h, w]]);
}

function renderSalaOnMap(salaId) {
  if (!indoorMap) return;
  const sala = allSalas.find(s => s.id === salaId);
  if (!sala) return;

  currentSalaId = salaId;

  const titleEl = el('map-sala-title');
  const descEl = el('map-sala-desc');
  if (titleEl) titleEl.textContent = sala.nombre;
  if (descEl) descEl.textContent = `${sala.descripcion || 'Sin descripción'} · Dimensiones: ${sala.ancho}×${sala.alto} px`;

  mapMarkers.forEach(m => indoorMap.removeLayer(m));
  mapMarkers = [];
  if (mapImageOverlay) {
    indoorMap.removeLayer(mapImageOverlay);
    mapImageOverlay = null;
  }

  const w = sala.ancho || 1000;
  const h = sala.alto || 700;
  const bounds = [[0, 0], [h, w]];

  mapImageOverlay = L.imageOverlay(sala.plano_imagen, bounds).addTo(indoorMap);
  indoorMap.fitBounds(bounds);

  const itemsEnSala = allItems.filter(it => it.sala_id === sala.id && it.pos_x !== null && it.pos_y !== null);

  const selItemMap = el('map-item-select');
  if (selItemMap) {
    selItemMap.innerHTML = '<option value="">🎯 Enfocar equipo en el plano…</option>';
    itemsEnSala.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = `[${it.id}] ${it.descripcion}`;
      selItemMap.appendChild(opt);
    });
  }

  let countMayor = 0, countMenor = 0, countIntangible = 0;

  itemsEnSala.forEach(it => {
    const tipoNorm = (it.tipo_inventario || 'mayor').toLowerCase();
    if (tipoNorm === 'mayor') countMayor++;
    else if (tipoNorm === 'menor') countMenor++;
    else countIntangible++;

    const lat = h - it.pos_y;
    const lng = it.pos_x;

    const strId = String(it.id || '');
    const pinLabel = strId.length > 4 ? strId.slice(-4) : strId;
    const pinHtml = `<div class="custom-pin ${tipoNorm}" id="pin-${strId}" title="No. ${escapeHtml(strId)}">${escapeHtml(pinLabel)}</div>`;

    const customIcon = L.divIcon({
      html: pinHtml,
      className: 'custom-pin-container',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -15]
    });

    const hasRealImg = it.imagen && !it.imagen.endsWith('/') && it.imagen.includes('.');
    const imgPopup = hasRealImg
      ? `<div class="popup-img-wrap"><img src="${escapeHtml(it.imagen)}" alt="${escapeHtml(it.descripcion)}"
              onclick="openPhotoModal('${escapeHtml(it.imagen)}', '${escapeHtml(strId)} - ${escapeHtml(it.descripcion)}')"
              onerror="this.parentElement.style.display='none'"></div>`
      : '';

    const editBtnInPopup = hasEditPermission()
      ? `<button type="button" class="button ghost" style="padding:2px 8px;font-size:0.75rem;margin-top:6px" onclick="startEditItem('${escapeHtml(strId)}')">✏️ Editar equipo</button>`
      : '';

    const popupContent = `
      <div class="popup-card">
        ${imgPopup}
        <div class="popup-content">
          <h4>No. ${escapeHtml(strId)}</h4>
          <p><strong>${escapeHtml(it.descripcion)}</strong></p>
          ${it.ubicacion ? `<p>📍 ${escapeHtml(it.ubicacion)}</p>` : ''}
          ${it.observacion ? `<p style="font-style:italic;color:var(--text-soft)">${escapeHtml(it.observacion)}</p>` : ''}
          <div class="popup-footer">
            <span class="badge ${tipoNorm}">${escapeHtml(it.tipo_inventario)}</span>
            <span style="font-size:0.8rem;color:var(--text-soft)">👤 ${escapeHtml(it.funcionario || 'Sin asignar')}</span>
          </div>
          ${editBtnInPopup}
        </div>
      </div>
    `;

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(indoorMap);
    marker.bindPopup(popupContent);
    marker.itemId = strId;
    mapMarkers.push(marker);
  });

  const legMayor = el('leg-count-mayor');
  const legMenor = el('leg-count-menor');
  const legInt = el('leg-count-intangible');
  if (legMayor) legMayor.textContent = countMayor;
  if (legMenor) legMenor.textContent = countMenor;
  if (legInt) legInt.textContent = countIntangible;
}

window.focusItemOnMap = function(itemId) {
  const strId = String(itemId);
  const it = allItems.find(x => String(x.id) === strId);
  if (!it || !it.sala_id) {
    showToast(`El ítem ${strId} no tiene ubicación fijada en ningún plano`, 'info');
    return;
  }

  switchView('mapa');

  if (currentSalaId !== it.sala_id) {
    el('map-sala-select').value = it.sala_id;
    renderSalaOnMap(it.sala_id);
  }

  setTimeout(() => {
    const marker = mapMarkers.find(m => m.itemId === strId);
    if (marker) {
      const sala = allSalas.find(s => s.id === it.sala_id);
      const h = sala ? sala.alto : 700;
      const lat = h - it.pos_y;
      const lng = it.pos_x;

      indoorMap.setView([lat, lng], 0.75, { animate: true });
      marker.openPopup();

      const pinEl = el(`pin-${strId}`);
      if (pinEl) {
        pinEl.classList.add('selected');
        setTimeout(() => pinEl.classList.remove('selected'), 3000);
      }
    }
  }, 250);
};

// =========================================================================
// 7. DISEÑADOR VISUAL DE PLANOS 2D (ADMIN)
// =========================================================================

const canvas = el('designer-canvas');
const inspector = el('designer-inspector');

window.zoomCanvas = function(delta) {
  canvasZoom = Math.min(2.0, Math.max(0.4, Math.round((canvasZoom + delta) * 10) / 10));
  applyCanvasZoom();
};

window.resetCanvasZoom = function() {
  canvasZoom = 1.0;
  applyCanvasZoom();
};

window.fitCanvasToViewport = function() {
  const viewport = el('canvas-viewport');
  if (!viewport) return;
  const w = parseInt(el('s-ancho').value) || 1000;
  const vpWidth = viewport.clientWidth - 40;
  if (vpWidth > 200 && w > 0) {
    canvasZoom = Math.min(1.0, Math.max(0.4, Math.round((vpWidth / w) * 10) / 10));
    applyCanvasZoom();
  }
};

function applyCanvasZoom() {
  if (canvas) canvas.style.transform = `scale(${canvasZoom})`;
  const label = el('zoom-level-label');
  if (label) label.textContent = `${Math.round(canvasZoom * 100)}%`;
}

function updateCanvasSize() {
  const w = parseInt(el('s-ancho').value) || 1000;
  const h = parseInt(el('s-alto').value) || 700;
  if (canvas) {
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
}

['s-ancho', 's-alto'].forEach(id => {
  el(id)?.addEventListener('input', updateCanvasSize);
});
el('s-nombre')?.addEventListener('input', (e) => {
  el('canvas-title-label').textContent = e.target.value || 'Plano de Sala';
});

window.addCanvasItem = function(type) {
  const id = getNextElementId();
  let width = 200;
  let height = 90;
  let label = 'Mesa';

  switch (type) {
    case 'mesa': width = 220; height = 100; label = 'Mesa de Trabajo'; break;
    case 'computo': width = 200; height = 80; label = 'Puesto Cómputo'; break;
    case 'gabinete': width = 110; height = 180; label = 'Gabinete'; break;
    case 'rack': width = 90; height = 90; label = 'Rack Red'; break;
    case 'puerta': width = 90; height = 40; label = 'Puerta'; break;
    case 'ventana': width = 220; height = 20; label = 'Ventanal'; break;
    case 'telon': width = 260; height = 24; label = 'Telón'; break;
    case 'texto': width = 200; height = 40; label = 'Zona Técnica'; break;
  }

  const canvasW = parseInt(canvas.style.width) || 1000;
  const canvasH = parseInt(canvas.style.height) || 700;
  const x = Math.max(20, Math.round(canvasW / 2 - width / 2 + (Math.random() * 40 - 20)));
  const y = Math.max(20, Math.round(canvasH / 2 - height / 2 + (Math.random() * 40 - 20)));

  const itemData = { id, type, x, y, width, height, rotation: 0, label };
  canvasElements.push(itemData);
  renderCanvasElements();
  selectCanvasItem(id);
  showToast(`Elemento "${label}" añadido`, 'info');
};

window.clearCanvas = function() {
  if (canvasElements.length && !confirm('¿Vaciar todos los elementos del plano?')) return;
  canvasElements = [];
  nextElementId = 1;
  selectedElementId = null;
  renderCanvasElements();
  hideInspector();
  showToast('Lienzo vaciado', 'info');
};

function selectCanvasItem(id) {
  selectedElementId = id;
  document.querySelectorAll('.canvas-element').forEach(node => {
    node.classList.toggle('selected', node.dataset.id === id);
  });

  const item = canvasElements.find(x => x.id === id);
  if (item) showInspector(item);
  else hideInspector();
}

function showInspector(item) {
  if (!inspector) return;
  inspector.classList.add('show');
  el('insp-elem-title').textContent = `${item.label}`;
  el('insp-label').value = item.label;
  el('insp-w').value = item.width;
  el('insp-h').value = item.height;
}

function hideInspector() {
  if (inspector) inspector.classList.remove('show');
}

el('insp-label')?.addEventListener('input', (e) => {
  if (!selectedElementId) return;
  const item = canvasElements.find(x => x.id === selectedElementId);
  if (item) {
    item.label = e.target.value;
    const domEl = canvas.querySelector(`.canvas-element[data-id="${item.id}"] span`);
    if (domEl) domEl.textContent = item.label;
    el('insp-elem-title').textContent = item.label;
  }
});

el('insp-w')?.addEventListener('change', (e) => {
  if (!selectedElementId) return;
  const item = canvasElements.find(x => x.id === selectedElementId);
  const val = parseInt(e.target.value);
  if (item && !isNaN(val) && val >= 20) {
    item.width = val;
    renderCanvasElements();
    selectCanvasItem(item.id);
  }
});

el('insp-h')?.addEventListener('change', (e) => {
  if (!selectedElementId) return;
  const item = canvasElements.find(x => x.id === selectedElementId);
  const val = parseInt(e.target.value);
  if (item && !isNaN(val) && val >= 15) {
    item.height = val;
    renderCanvasElements();
    selectCanvasItem(item.id);
  }
});

el('insp-btn-rotate')?.addEventListener('click', () => {
  if (selectedElementId) rotateCanvasItem(selectedElementId);
});

el('insp-btn-duplicate')?.addEventListener('click', () => {
  if (selectedElementId) duplicateCanvasItem(selectedElementId);
});

el('insp-btn-delete')?.addEventListener('click', () => {
  if (selectedElementId) deleteCanvasItem(selectedElementId);
});

function renderCanvasElements() {
  if (!canvas) return;
  const title = el('canvas-title-label');
  canvas.innerHTML = '';
  if (title) canvas.appendChild(title);

  canvasElements.forEach(item => {
    const div = document.createElement('div');
    div.className = `canvas-element ${item.type} ${selectedElementId === item.id ? 'selected' : ''}`;
    div.dataset.id = item.id;
    div.style.left = `${item.x}px`;
    div.style.top = `${item.y}px`;
    div.style.width = `${item.width}px`;
    div.style.height = `${item.height}px`;

    const controls = document.createElement('div');
    controls.className = 'elem-controls';
    controls.innerHTML = `
      <button type="button" class="elem-btn" title="Girar 90°" onclick="rotateCanvasItem('${item.id}', event)">🔄</button>
      <button type="button" class="elem-btn" title="Duplicar" onclick="duplicateCanvasItem('${item.id}', event)">📋</button>
      <button type="button" class="elem-btn" title="Eliminar" onclick="deleteCanvasItem('${item.id}', event)">❌</button>
    `;
    div.appendChild(controls);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    div.appendChild(labelSpan);

    makeDraggable(div, item);

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      selectCanvasItem(item.id);
    });

    canvas.appendChild(div);
  });
}

canvas?.addEventListener('click', (e) => {
  if (e.target === canvas || e.target === el('canvas-title-label')) {
    selectedElementId = null;
    document.querySelectorAll('.canvas-element').forEach(n => n.classList.remove('selected'));
    hideInspector();
  }
});

function makeDraggable(domElement, item) {
  let isDragging = false;
  let startX = 0, startY = 0;
  let initLeft = 0, initTop = 0;

  domElement.addEventListener('mousedown', (e) => {
    if (e.target.closest('.elem-controls')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initLeft = item.x;
    initTop = item.y;
    selectCanvasItem(item.id);

    const onMouseMove = (moveEvent) => {
      if (!isDragging) return;
      const dx = (moveEvent.clientX - startX) / canvasZoom;
      const dy = (moveEvent.clientY - startY) / canvasZoom;

      const canvasW = parseInt(canvas.style.width) || 1000;
      const canvasH = parseInt(canvas.style.height) || 700;

      let newX = Math.round((initLeft + dx) / 10) * 10;
      let newY = Math.round((initTop + dy) / 10) * 10;

      newX = Math.max(10, Math.min(canvasW - item.width - 10, newX));
      newY = Math.max(10, Math.min(canvasH - item.height - 10, newY));

      item.x = newX;
      item.y = newY;
      domElement.style.left = `${newX}px`;
      domElement.style.top = `${newY}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

window.rotateCanvasItem = function(id, e) {
  if (e) e.stopPropagation();
  const item = canvasElements.find(x => x.id === id);
  if (!item) return;
  const tmp = item.width;
  item.width = item.height;
  item.height = tmp;
  renderCanvasElements();
  selectCanvasItem(id);
};

window.duplicateCanvasItem = function(id, e) {
  if (e) e.stopPropagation();
  const item = canvasElements.find(x => x.id === id);
  if (!item) return;

  const newId = getNextElementId();
  const newItem = {
    ...item,
    id: newId,
    x: item.x + 20,
    y: item.y + 20,
    label: item.label + ' (Copia)'
  };

  canvasElements.push(newItem);
  renderCanvasElements();
  selectCanvasItem(newId);
  showToast(`Elemento duplicado: "${newItem.label}"`, 'info');
};

window.deleteCanvasItem = function(id, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const item = canvasElements.find(x => x.id === id);
  canvasElements = canvasElements.filter(x => x.id !== id);
  if (selectedElementId === id) {
    selectedElementId = null;
    hideInspector();
  }
  renderCanvasElements();
  if (item) showToast(`Elemento "${item.label}" eliminado`, 'info');
};

document.addEventListener('keydown', (e) => {
  if (!selectedElementId) return;
  const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    window.deleteCanvasItem(selectedElementId);
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    window.duplicateCanvasItem(selectedElementId);
  } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const item = canvasElements.find(x => x.id === selectedElementId);
    if (!item) return;

    const step = e.shiftKey ? 10 : 1;
    const canvasW = parseInt(canvas.style.width) || 1000;
    const canvasH = parseInt(canvas.style.height) || 700;

    if (e.key === 'ArrowUp') item.y = Math.max(10, item.y - step);
    if (e.key === 'ArrowDown') item.y = Math.min(canvasH - item.height - 10, item.y + step);
    if (e.key === 'ArrowLeft') item.x = Math.max(10, item.x - step);
    if (e.key === 'ArrowRight') item.x = Math.min(canvasW - item.width - 10, item.x + step);

    const dom = canvas.querySelector(`.canvas-element[data-id="${item.id}"]`);
    if (dom) {
      dom.style.left = `${item.x}px`;
      dom.style.top = `${item.y}px`;
    }
  }
});

// Parser inteligente de SVG
function parseSvgToCanvasElements(svgText, defaultW = 1000, defaultH = 700) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return { elements: [], width: defaultW, height: defaultH, title: '' };

    let w = parseFloat(svgEl.getAttribute('width')) || defaultW;
    let h = parseFloat(svgEl.getAttribute('height')) || defaultH;
    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(parseFloat);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        w = parts[2];
        h = parts[3];
      }
    }

    let salaTitle = '';
    const titleTexts = Array.from(doc.querySelectorAll('text')).filter(t => {
      const fs = parseFloat(t.getAttribute('font-size') || '14');
      const y = parseFloat(t.getAttribute('y') || '0');
      const txt = t.textContent.trim().toLowerCase();
      const isTitleKeyword = /laboratorio|sala de|oficina|auditorio|esquema arquitect[oó]nico|[aá]rea de sensores/.test(txt);
      return (fs >= 19 && y < 130) || (isTitleKeyword && y < 130);
    });
    if (titleTexts.length > 0) salaTitle = titleTexts[0].textContent.trim();

    const embeddedData = doc.getElementById('canvas-elements-data');
    if (embeddedData && embeddedData.textContent.trim()) {
      try {
        const parsed = JSON.parse(embeddedData.textContent.trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { elements: parsed, width: w, height: h, title: salaTitle };
        }
      } catch (err) {
        console.warn('Advertencia leyendo datos embebidos:', err);
      }
    }

    const elements = [];
    const consumedTexts = new Set();
    titleTexts.forEach(t => consumedTexts.add(t));

    const classify = (label) => {
      const l = (label || '').toLowerCase();
      if (/c[oó]mputo|computador|pc|laptop|workstation|docente/.test(l)) return 'computo';
      if (/mesa|escritorio|juntas|reuni[oó]n|calibraci[oó]n|trabajo|escenario|atril|silleter[ií]a/.test(l)) return 'mesa';
      if (/gabinete|armario|archivador|estante|bodega/.test(l)) return 'gabinete';
      if (/rack|servidor|switch|comunicaci[oó]n/.test(l)) return 'rack';
      if (/puerta|acceso|entrada|salida/.test(l)) return 'puerta';
      if (/ventana|ventanal/.test(l)) return 'ventana';
      if (/tel[oó]n|pantalla|proyector|proyecci[oó]n|videobeam/.test(l)) return 'telon';
      return 'mesa';
    };

    const groups = Array.from(doc.querySelectorAll('g'));
    groups.forEach((g, idx) => {
      const gid = g.getAttribute('id') || '';
      if (gid.startsWith('grid') || gid.startsWith('defs')) return;

      const rects = Array.from(g.querySelectorAll('rect'));
      const texts = Array.from(g.querySelectorAll('text'));
      texts.forEach(t => consumedTexts.add(t));

      const label = texts.map(t => t.textContent.trim()).filter(Boolean).join(' ') || gid || `Elemento ${idx + 1}`;
      const type = classify(label);

      if (rects.length > 0) {
        const r = rects[0];
        const rx = Math.round(parseFloat(r.getAttribute('x')) || 0);
        const ry = Math.round(parseFloat(r.getAttribute('y')) || 0);
        const rw = Math.round(parseFloat(r.getAttribute('width')) || 100);
        const rh = Math.round(parseFloat(r.getAttribute('height')) || 80);
        elements.push({
          id: gid || `elem_${elements.length + 1}`,
          type,
          label,
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          rotation: 0
        });
      }
    });

    const allRects = Array.from(doc.querySelectorAll('rect'));
    allRects.forEach((r, idx) => {
      if (r.closest('g') && !r.closest('g').id.startsWith('grid')) return;

      const rw = Math.round(parseFloat(r.getAttribute('width')) || 0);
      const rh = Math.round(parseFloat(r.getAttribute('height')) || 0);
      const rx = Math.round(parseFloat(r.getAttribute('x')) || 0);
      const ry = Math.round(parseFloat(r.getAttribute('y')) || 0);

      const isBackground = (rw >= w * 0.9 && rh >= h * 0.9);
      const isWall = (rx < 60 && ry < 60 && rw >= w * 0.8 && rh >= h * 0.8 && r.getAttribute('fill') === 'none');
      if (isBackground || isWall) return;

      let bestText = null;
      let bestDist = 999999;
      const cx = rx + rw / 2;
      const cy = ry + rh / 2;

      const allTexts = Array.from(doc.querySelectorAll('text'));
      allTexts.forEach(t => {
        if (consumedTexts.has(t)) return;
        const tx = parseFloat(t.getAttribute('x')) || 0;
        const ty = parseFloat(t.getAttribute('y')) || 0;
        const dist = Math.hypot(cx - tx, cy - ty);
        if (dist < bestDist && dist < Math.max(rw, rh) * 1.6) {
          bestDist = dist;
          bestText = t;
        }
      });

      let label = bestText ? bestText.textContent.trim() : `Elemento ${idx + 1}`;
      if (bestText) consumedTexts.add(bestText);

      elements.push({
        id: `elem_${elements.length + 1}`,
        type: classify(label),
        label,
        x: rx,
        y: ry,
        width: rw,
        height: rh,
        rotation: 0
      });
    });

    return { elements, width: w, height: h, title: salaTitle };
  } catch (err) {
    console.error('Error parseando SVG de plano:', err);
    return { elements: [], width: defaultW, height: defaultH, title: '' };
  }
}

function compileCanvasToSvg(w, h, salaNombre) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n`;
  svg += `  <defs>\n`;
  svg += `    <pattern id="grid_${Date.now()}" width="30" height="30" patternUnits="userSpaceOnUse">\n`;
  svg += `      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" stroke-width="1"/>\n`;
  svg += `    </pattern>\n`;
  svg += `  </defs>\n`;
  svg += `  <rect width="${w}" height="${h}" fill="#f8fafc"/>\n`;
  svg += `  <rect width="${w}" height="${h}" fill="url(#grid_${Date.now()})"/>\n`;
  svg += `  <rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="#334155" stroke-width="12" rx="6"/>\n`;
  svg += `  <text x="${w / 2}" y="65" font-family="sans-serif" font-size="22" font-weight="bold" fill="#065f46" text-anchor="middle">${escapeHtml(salaNombre)}</text>\n`;
  svg += `  <script type="application/json" id="canvas-elements-data">${JSON.stringify(canvasElements)}</script>\n`;

  canvasElements.forEach(it => {
    const x = it.x;
    const y = it.y;
    const wE = it.width;
    const hE = it.height;
    const label = escapeHtml(it.label);

    switch (it.type) {
      case 'mesa':
        svg += `  <g id="${it.id}">\n<rect x="${x}" y="${y}" width="${wE}" height="${hE}" rx="6" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>\n<text x="${x + wE / 2}" y="${y + hE / 2 + 5}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1e293b" text-anchor="middle">${label}</text>\n</g>\n`;
        break;
      case 'computo':
        svg += `  <g id="${it.id}">\n<rect x="${x}" y="${y}" width="${wE}" height="${hE}" rx="5" fill="#eff6ff" stroke="#2563eb" stroke-width="3"/>\n<rect x="${x + wE / 2 - 25}" y="${y + 12}" width="50" height="28" rx="3" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>\n<text x="${x + wE / 2}" y="${y + hE - 15}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1e3a8a" text-anchor="middle">${label}</text>\n</g>\n`;
        break;
      case 'gabinete':
        svg += `  <g id="${it.id}">\n<rect x="${x}" y="${y}" width="${wE}" height="${hE}" rx="4" fill="#d1fae5" stroke="#059669" stroke-width="3"/>\n<text x="${x + wE / 2}" y="${y + hE / 2 + 5}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#064e3b" text-anchor="middle">${label}</text>\n</g>\n`;
        break;
      case 'rack':
        svg += `  <g id="${it.id}">\n<rect x="${x}" y="${y}" width="${wE}" height="${hE}" fill="#cbd5e1" stroke="#0f172a" stroke-width="3"/>\n<text x="${x + wE / 2}" y="${y + hE / 2 + 5}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0f172a" text-anchor="middle">${label}</text>\n</g>\n`;
        break;
      case 'puerta':
        svg += `  <g id="${it.id}">\n<line x1="${x}" y1="${y + hE}" x2="${x + wE}" y2="${y + hE}" stroke="#f8fafc" stroke-width="14"/>\n<line x1="${x}" y1="${y + hE}" x2="${x}" y2="${y}" stroke="#475569" stroke-width="3"/>\n<path d="M ${x} ${y + hE} A ${wE} ${hE} 0 0 1 ${x + wE} ${y}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,4"/>\n<text x="${x + wE / 2}" y="${y + hE - 8}" font-family="sans-serif" font-size="11" fill="#475569" text-anchor="middle">${label}</text>\n</g>\n`;
        break;
      case 'ventana':
        svg += `  <g id="${it.id}">\n<rect x="${x}" y="${y}" width="${wE}" height="${hE}" fill="#dbeafe" stroke="#0284c7" stroke-width="3"/>\n<text x="${x + wE / 2}" y="${y + hE / 2 + 4}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#0369a1" text-anchor="middle">${label}</text>\n</g>\n`;
        break;
      case 'telon':
        svg += `  <g id="${it.id}">\n<rect x="${x}" y="${y}" width="${wE}" height="${hE}" rx="3" fill="#1d4ed8" stroke="#172554" stroke-width="2"/>\n<text x="${x + wE / 2}" y="${y + hE + 16}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1d4ed8" text-anchor="middle">${label}</text>\n</g>\n`;
        break;
      case 'texto':
        svg += `  <text x="${x + wE / 2}" y="${y + hE / 2 + 5}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#334155" text-anchor="middle">${label}</text>\n`;
        break;
    }
  });

  svg += `</svg>`;
  return svg;
}

el('sala-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!hasEditPermission()) return;

  const id = el('s-id').value.trim().toLowerCase().replace(/\s+/g, '_');
  const nombre = el('s-nombre').value.trim();
  const descripcion = el('s-desc').value.trim();
  const ancho = parseInt(el('s-ancho').value) || 1000;
  const alto = parseInt(el('s-alto').value) || 700;

  const fileInputPlano = el('s-archivo-plano');

  try {
    showToast('Guardando plano de la sala…', 'info');

    if (fileInputPlano.files.length > 0 && !fileInputPlano.files[0].name.toLowerCase().endsWith('.svg')) {
      const formData = new FormData();
      formData.append('file', fileInputPlano.files[0]);

      const uploadRes = await fetch('/api/upload/plano', {
        method: 'POST',
        body: formData
      });
      if (!uploadRes.ok) throw new Error('Error al subir el archivo de plano');
      const uploadData = await uploadRes.json();

      const salaPayload = { id, nombre, descripcion, plano_imagen: uploadData.url, ancho, alto };
      const res = await fetch('/api/salas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salaPayload)
      });
      if (!res.ok) throw new Error('Error al guardar datos de la sala');
    }
    else if (canvasElements.length > 0 || fileInputPlano.files.length > 0 || !editingSalaId) {
      const svgContent = compileCanvasToSvg(ancho, alto, nombre);
      const res = await fetch('/api/salas/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nombre, descripcion, ancho, alto, svg_content: svgContent })
      });
      if (!res.ok) throw new Error('Error al guardar el plano diseñado');
    }
    else {
      const existingSala = allSalas.find(s => s.id === editingSalaId);
      const salaPayload = {
        id,
        nombre,
        descripcion,
        plano_imagen: existingSala ? existingSala.plano_imagen : `uploads/planos/plano_${id}.svg`,
        ancho,
        alto
      };
      const res = await fetch('/api/salas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salaPayload)
      });
      if (!res.ok) throw new Error('Error al actualizar datos de la sala');
    }

    showToast(`¡Sala "${nombre}" guardada con éxito!`, 'ok');
    resetSalaForm();
    await loadData();
    populateFilters();
    renderSalasGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Importar SVG desde disco al diseñador
if (el('s-archivo-plano')) {
  el('s-archivo-plano').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.svg') || file.type.includes('svg')) {
      try {
        showToast('Procesando archivo SVG…', 'info');
        const text = await file.text();
        const parsed = parseSvgToCanvasElements(text, parseInt(el('s-ancho').value) || 1000, parseInt(el('s-alto').value) || 700);
        if (parsed.elements.length > 0) {
          canvasElements = parsed.elements;
          ensureUniqueElementIds();
          if (parsed.width) el('s-ancho').value = parsed.width;
          if (parsed.height) el('s-alto').value = parsed.height;
          if (parsed.title && !el('s-nombre').value) el('s-nombre').value = parsed.title;
          updateCanvasSize();
          renderCanvasElements();
          showToast(`Se extrajeron ${parsed.elements.length} elementos interactivos del archivo SVG`, 'ok');
        }
      } catch (err) {
        console.warn('Error procesando archivo SVG:', err);
      }
    }
  });
}

function resetSalaForm() {
  editingSalaId = null;
  el('sala-form').reset();
  el('s-id').readOnly = false;
  el('s-id').style.backgroundColor = '#fff';
  el('s-ancho').value = 1000;
  el('s-alto').value = 700;
  el('sala-form-title').textContent = '📐 Diseñador Visual de Planos de Sala 2D';
  el('btn-save-sala').textContent = '💾 Guardar Plano y Sala';
  el('btn-cancel-sala-edit').style.display = 'none';

  canvas.style.backgroundImage = `
    linear-gradient(to right, #e2e8f0 1px, transparent 1px),
    linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
  `;
  canvas.style.backgroundSize = '30px 30px';
  canvas.style.backgroundRepeat = 'repeat';

  updateCanvasSize();
  canvasElements = [];
  nextElementId = 1;
  selectedElementId = null;
  hideInspector();
  el('canvas-title-label').textContent = 'Plano de Sala';
  renderCanvasElements();
  resetCanvasZoom();
}

el('btn-reset-sala')?.addEventListener('click', resetSalaForm);
el('btn-cancel-sala-edit')?.addEventListener('click', resetSalaForm);

// Modificar plano de sala directamente desde el visor
window.editCurrentSalaPlan = function() {
  if (!currentSalaId || !hasEditPermission()) return;
  switchView('designer');
  startEditSala(currentSalaId);
};

el('btn-edit-room-plan')?.addEventListener('click', editCurrentSalaPlan);

window.startEditSala = async function(salaId) {
  if (!hasEditPermission()) return;
  const sala = allSalas.find(s => s.id === salaId);
  if (!sala) return;

  editingSalaId = salaId;

  el('s-id').value = sala.id;
  el('s-id').readOnly = true;
  el('s-id').style.backgroundColor = '#f1f5f9';
  el('s-nombre').value = sala.nombre;
  el('s-desc').value = sala.descripcion || '';
  el('s-ancho').value = sala.ancho || 1000;
  el('s-alto').value = sala.alto || 700;

  el('sala-form-title').textContent = `Editando Sala: ${sala.nombre}`;
  el('btn-save-sala').textContent = '💾 Guardar Cambios de la Sala';
  el('btn-cancel-sala-edit').style.display = 'inline-block';

  updateCanvasSize();
  el('canvas-title-label').textContent = sala.nombre;

  canvas.style.backgroundImage = `
    linear-gradient(to right, #e2e8f0 1px, transparent 1px),
    linear-gradient(to bottom, #e2e8f0 1px, transparent 1px)
  `;
  canvas.style.backgroundSize = '30px 30px';
  canvas.style.backgroundRepeat = 'repeat';

  showToast(`Cargando plano vectorial de "${sala.nombre}"…`, 'info');

  try {
    if (sala.plano_imagen && sala.plano_imagen.toLowerCase().endsWith('.svg')) {
      const res = await fetch(`${sala.plano_imagen}?t=${Date.now()}`);
      if (res.ok) {
        const svgText = await res.text();
        const parsed = parseSvgToCanvasElements(svgText, sala.ancho || 1000, sala.alto || 700);

        if (parsed.width) el('s-ancho').value = parsed.width;
        if (parsed.height) el('s-alto').value = parsed.height;
        updateCanvasSize();

        canvasElements = parsed.elements;
        ensureUniqueElementIds();
        selectedElementId = null;
        renderCanvasElements();
        hideInspector();
        fitCanvasToViewport();

        showToast(`Plano listo: ${canvasElements.length} elementos interactivos cargados.`, 'ok');
      } else {
        throw new Error('No se pudo descargar el archivo SVG');
      }
    } else {
      canvas.style.backgroundImage = `url('${sala.plano_imagen}?t=${Date.now()}')`;
      canvas.style.backgroundSize = '100% 100%';
      canvas.style.backgroundRepeat = 'no-repeat';
      canvasElements = [];
      nextElementId = 1;
      selectedElementId = null;
      renderCanvasElements();
      hideInspector();
      fitCanvasToViewport();
      showToast('Plano raster cargado como fondo.', 'info');
    }
  } catch (err) {
    console.warn('Error cargando elementos SVG:', err);
    canvas.style.backgroundImage = `url('${sala.plano_imagen}?t=${Date.now()}')`;
    canvas.style.backgroundSize = '100% 100%';
    canvas.style.backgroundRepeat = 'no-repeat';
    canvasElements = [];
    nextElementId = 1;
    selectedElementId = null;
    renderCanvasElements();
    hideInspector();
    fitCanvasToViewport();
    showToast('Se cargó el plano como imagen de fondo.', 'info');
  }

  el('sala-form').scrollIntoView({ behavior: 'smooth' });
};

function renderSalasGrid() {
  const container = el('salas-list');
  if (!container) return;

  if (!allSalas.length) {
    container.innerHTML = '<p style="color:var(--text-soft);padding:14px">No hay salas creadas aún.</p>';
    return;
  }

  container.innerHTML = allSalas.map(s => {
    const itemsCount = allItems.filter(it => it.sala_id === s.id).length;
    return `
      <div class="sala-card">
        <div>
          <img class="sala-card-thumb" src="${escapeHtml(s.plano_imagen)}?t=${Date.now()}" alt="${escapeHtml(s.nombre)}">
          <h3>${escapeHtml(s.nombre)}</h3>
          <p>${escapeHtml(s.descripcion || 'Sin descripción física')}</p>
          <div style="font-size:0.8rem;color:var(--text-soft);font-family:var(--mono)">
            📐 ${s.ancho} × ${s.alto} px · 📦 ${itemsCount} equipos en sala
          </div>
        </div>
        <div class="sala-card-actions">
          <button type="button" class="button ghost" onclick="startEditSala('${escapeHtml(s.id)}')">✏️ Modificar Plano</button>
          <button type="button" class="button danger" onclick="deleteSala('${escapeHtml(s.id)}')">🗑️ Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteSala = async function(salaId) {
  if (!hasEditPermission()) return;
  if (!confirm(`¿Eliminar la sala "${salaId}"? Los equipos no se borrarán, pero perderán su posición en el plano.`)) return;

  try {
    const res = await fetch(`/api/salas/${salaId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar la sala');

    showToast(`Sala "${salaId}" eliminada`, 'ok');
    await loadData();
    populateFilters();
    renderSalasGrid();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// =========================================================================
// 8. CAMBIO DE VISTAS (TABLA, MAPA, DISEÑADOR)
// =========================================================================

function switchView(view) {
  currentView = view;
  const btnTabla = el('btn-view-tabla');
  const btnMapa = el('btn-view-mapa');
  const btnDesigner = el('btn-view-designer');
  const secTabla = el('table-view-section');
  const secMapa = el('map-view-section');
  const secDesigner = el('designer-view-section');
  const filterControls = el('search-filter-controls');

  [btnTabla, btnMapa, btnDesigner].forEach(b => b?.classList.remove('active'));
  [secTabla, secMapa, secDesigner].forEach(s => { if (s) s.style.display = 'none'; });

  if (view === 'tabla') {
    btnTabla?.classList.add('active');
    if (secTabla) secTabla.style.display = 'block';
    if (filterControls) filterControls.style.display = 'flex';
  } else if (view === 'mapa') {
    btnMapa?.classList.add('active');
    if (secMapa) secMapa.style.display = 'block';
    if (filterControls) filterControls.style.display = 'flex';

    initIndoorMap();
    setTimeout(() => {
      indoorMap.invalidateSize();
      if (currentSalaId) renderSalaOnMap(currentSalaId);
    }, 150);
  } else if (view === 'designer') {
    if (!hasEditPermission()) {
      switchView('tabla');
      return;
    }
    btnDesigner?.classList.add('active');
    if (secDesigner) secDesigner.style.display = 'block';
    if (filterControls) filterControls.style.display = 'none';

    renderSalasGrid();
    setTimeout(() => fitCanvasToViewport(), 100);
  }
}

// Modal de Fotos
window.openPhotoModal = function(imgSrc, title) {
  el('modal-img').src = imgSrc;
  el('modal-title').textContent = title || 'Foto del Equipo';
  el('photo-modal').classList.add('show');
};

window.closePhotoModal = function() {
  el('photo-modal').classList.remove('show');
  el('modal-img').src = '';
};

// =========================================================================
// 9. INICIALIZACIÓN Y EVENT LISTENERS
// =========================================================================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    initAuth();
    await loadData();
    populateFilters();
    renderTable();

    // Filtros de búsqueda
    ['search', 'filter-tipo', 'filter-funcionario', 'filter-sala'].forEach(id => {
      const node = el(id);
      if (node) {
        node.addEventListener('input', () => renderTable());
        node.addEventListener('change', () => renderTable());
      }
    });

    el('btn-clear-filters')?.addEventListener('click', clearFilters);

    // Cambio de sala en el mapa
    el('map-sala-select')?.addEventListener('change', (e) => {
      renderSalaOnMap(e.target.value);
    });

    // Enfocar equipo dentro de la sala
    el('map-item-select')?.addEventListener('change', (e) => {
      if (e.target.value) focusItemOnMap(e.target.value);
    });

    el('btn-center-map')?.addEventListener('click', centerMapOnBounds);

    // Cambio de vista
    el('btn-view-tabla')?.addEventListener('click', () => switchView('tabla'));
    el('btn-view-mapa')?.addEventListener('click', () => switchView('mapa'));
    el('btn-view-designer')?.addEventListener('click', () => switchView('designer'));

    // Modales: cerrar con clic exterior o ESC
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('show');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
      }
    });

    // Parámetro de URL para abrir login o vista específica (ej. ?auth=1)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth') === '1' && !currentUser) {
      openLoginModal();
    }

  } catch (err) {
    const tbody = el('rows');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td class="empty" colspan="7" style="color:#dc2626;padding:24px;text-align:center">
            ⚠️ <strong>Error cargando el inventario:</strong> ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }
});

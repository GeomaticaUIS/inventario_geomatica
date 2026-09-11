// js/admin.js - Lógica de Administración de Inventario y Diseñador Visual de Planos

let items = [];
let salas = [];
let usuarios = [];
let loggedUser = null;
let editingId = null;
let currentPhotoUrl = '';

// Mapa de asignación de coordenadas de ítems
let adminMap = null;
let adminImageOverlay = null;
let adminMarker = null;
let currentAdminSala = null;

// Estado del Diseñador Visual de Planos
let canvasElements = [];
let selectedElementId = null;
let nextElementId = 1;
let editingSalaId = null;

const el = id => document.getElementById(id);
const statusBox = el('status');
const loginStatusBox = el('login-status');

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showStatus(box, msg, type = 'info') {
  box.textContent = msg;
  box.className = `status-msg show ${type}`;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearStatus(box) {
  box.className = 'status-msg';
}

function tipoBadgeClass(tipo) {
  return 'badge ' + (tipo || '').toLowerCase();
}

// ---------- Autenticación ----------

el('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = el('login-user').value.trim();
  const password = el('login-pass').value;

  try {
    showStatus(loginStatusBox, 'Verificando credenciales…', 'info');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'Usuario o contraseña incorrectos');
    }

    loggedUser = data.user;
    sessionStorage.setItem('inv-auth-user', JSON.stringify(loggedUser));
    enterAdmin();
  } catch (err) {
    showStatus(loginStatusBox, err.message, 'error');
  }
});

el('logout-btn').addEventListener('click', () => {
  sessionStorage.removeItem('inv-auth-user');
  loggedUser = null;
  el('admin-screen').style.display = 'none';
  el('login-screen').style.display = 'block';
  el('login-form').reset();
  clearStatus(loginStatusBox);
});

function enterAdmin() {
  el('login-screen').style.display = 'none';
  el('admin-screen').style.display = 'block';
  el('logged-user-label').textContent = `${loggedUser.nombre} (${loggedUser.usuario})`;
  initAdminData();
}

// ---------- Pestañas de Navegación ----------

el('tab-btn-items').addEventListener('click', () => {
  el('tab-btn-items').classList.add('active');
  el('tab-btn-salas').classList.remove('active');
  el('sec-admin-items').style.display = 'block';
  el('sec-admin-salas').style.display = 'none';
});

el('tab-btn-salas').addEventListener('click', () => {
  el('tab-btn-salas').classList.add('active');
  el('tab-btn-items').classList.remove('active');
  el('sec-admin-items').style.display = 'none';
  el('sec-admin-salas').style.display = 'block';
  renderSalasGrid();
});

// ---------- Carga de Datos Globales ----------

async function initAdminData() {
  try {
    const [resItems, resSalas, resUsers] = await Promise.all([
      fetch('/api/items', { cache: 'no-store' }),
      fetch('/api/salas', { cache: 'no-store' }),
      fetch('/api/auth/usuarios', { cache: 'no-store' })
    ]);

    items = await resItems.json();
    salas = await resSalas.json();
    usuarios = await resUsers.json();

    populateSelects();
    renderTable();
    renderSalasGrid();
  } catch (err) {
    showStatus(statusBox, 'Error cargando datos del servidor: ' + err.message, 'error');
  }
}

function populateSelects() {
  // Select de Responsables
  const selFunc = el('f-funcionario');
  selFunc.innerHTML = '<option value="">-- Seleccionar responsable --</option>';

  const defaultResponsables = [
    { value: 'HERNAN PORRAS', label: 'HERNAN PORRAS (Rector)' },
    { value: 'JHON CÁCERES', label: 'JHON CÁCERES' },
    { value: 'YERLY MARTINEZ', label: 'YERLY MARTINEZ' },
    { value: 'CARLOS GARCIA', label: 'CARLOS GARCIA' }
  ];

  const addedValues = new Set();
  defaultResponsables.forEach(r => {
    addedValues.add(r.value.toUpperCase());
    const opt = document.createElement('option');
    opt.value = r.value;
    opt.textContent = r.label;
    selFunc.appendChild(opt);
  });

  // Agregar otros responsables existentes en los ítems si no están en la lista base
  items.forEach(it => {
    const f = (it.funcionario || '').trim();
    if (f && !addedValues.has(f.toUpperCase())) {
      addedValues.add(f.toUpperCase());
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f;
      selFunc.appendChild(opt);
    }
  });

  // Select de Salas en formulario de ítems
  const selSala = el('f-sala');
  selSala.innerHTML = '<option value="">-- Sin sala asignada --</option>';
  salas.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nombre;
    selSala.appendChild(opt);
  });
}

// ---------- Render de Tabla de Ítems ----------

function renderTable() {
  const tbody = el('admin-rows');
  el('count').textContent = `${items.length} ítems`;

  if (!items.length) {
    tbody.innerHTML = `<tr><td class="empty" colspan="7">Aún no hay ítems en el inventario. Añade uno arriba.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(it => {
    const imgHtml = it.imagen
      ? `<img class="thumb" src="${escapeHtml(it.imagen)}" alt="" onerror="this.outerHTML='<div class=&quot;thumb thumb-empty&quot;></div>'">`
      : `<div class="thumb thumb-empty"></div>`;

    const salaText = it.sala_nombre ? escapeHtml(it.sala_nombre) : (it.ubicacion ? escapeHtml(it.ubicacion) : '—');
    const coordIndicator = (it.pos_x !== null && it.pos_y !== null) ? '📍 En plano' : '';

    return `
      <tr>
        <td>${imgHtml}</td>
        <td class="id">${escapeHtml(it.id)}</td>
        <td>
          <strong>${escapeHtml(it.descripcion)}</strong>
          ${it.observacion ? `<br><span style="color:var(--ink-soft);font-size:0.8rem">${escapeHtml(it.observacion)}</span>` : ''}
        </td>
        <td>
          ${salaText}
          ${coordIndicator ? `<br><span style="font-size:0.75rem;color:var(--teal-dark);font-family:var(--mono)">${coordIndicator}</span>` : ''}
        </td>
        <td><span class="${tipoBadgeClass(it.tipo_inventario)}">${escapeHtml(it.tipo_inventario)}</span></td>
        <td>${escapeHtml(it.funcionario || '—')}</td>
        <td class="row-actions">
          <button type="button" class="ghost" data-edit-id="${escapeHtml(it.id)}">Editar</button>
          <button type="button" class="danger" data-delete-id="${escapeHtml(it.id)}">Eliminar</button>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.addEventListener('click', () => startEdit(btn.dataset.editId));
  });

  tbody.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.deleteId));
  });
}

// ---------- Asignador de Coordenadas de Ítems en Plano (Leaflet) ----------

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

  const sala = salas.find(s => s.id === salaId);
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
  }, 100);
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
      iconSize: [28, 28],
      iconAnchor: [14, 14]
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
  el('coord-display').textContent = 'Sin ubicación fijada';
}

el('btn-clear-coords').addEventListener('click', clearAdminMarker);

el('f-sala').addEventListener('change', (e) => {
  updateAdminMapForSala(e.target.value);
});

// ---------- Formulario de Ítems ----------

function startEdit(id) {
  const it = items.find(x => x.id === id);
  if (!it) return;

  editingId = id;
  el('item-original-id').value = id;
  el('f-id').value = it.id;
  el('f-descripcion').value = it.descripcion;
  el('f-ubicacion').value = it.ubicacion || '';
  el('f-observacion').value = it.observacion || '';

  // Normalizar Tipo de inventario a mayúsculas
  const tipoNorm = (it.tipo_inventario || 'MAYOR').trim().toUpperCase();
  el('f-tipo').value = ['MAYOR', 'MENOR', 'INTANGIBLE'].includes(tipoNorm) ? tipoNorm : 'MAYOR';

  // Normalizar Responsable
  let funcVal = (it.funcionario || '').trim();
  const funcUpper = funcVal.toUpperCase();
  if (funcUpper === 'RECTOR' || funcUpper.includes('PORRAS')) {
    funcVal = 'HERNAN PORRAS';
  } else if (funcUpper === 'JHON' || funcUpper.includes('CACERES') || funcUpper.includes('CÁCERES') || funcUpper.includes('CERES')) {
    funcVal = 'JHON CÁCERES';
  } else if (funcUpper === 'YERLY' || funcUpper.includes('MARTINEZ') || funcUpper.includes('MARTÍNEZ')) {
    funcVal = 'YERLY MARTINEZ';
  } else if (funcUpper === 'CARLOS' || funcUpper.includes('GARCIA') || funcUpper.includes('GARCÍA')) {
    funcVal = 'CARLOS GARCIA';
  }

  // Buscar coincidencia en el select de responsable
  let matchedIndex = -1;
  for (let i = 0; i < el('f-funcionario').options.length; i++) {
    const optVal = el('f-funcionario').options[i].value.toUpperCase();
    if (optVal && (optVal === funcVal.toUpperCase() || (funcVal && optVal.includes(funcVal.toUpperCase())))) {
      matchedIndex = i;
      break;
    }
  }

  if (matchedIndex >= 0) {
    el('f-funcionario').selectedIndex = matchedIndex;
  } else if (funcVal) {
    const opt = document.createElement('option');
    opt.value = funcVal;
    opt.textContent = funcVal;
    el('f-funcionario').appendChild(opt);
    el('f-funcionario').value = funcVal;
  } else {
    el('f-funcionario').value = '';
  }

  el('f-sala').value = it.sala_id || '';
  el('f-imagen').value = '';

  currentPhotoUrl = it.imagen || '';
  const previewBox = el('imagen-actual-preview');
  if (it.imagen) {
    previewBox.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <img src="${escapeHtml(it.imagen)}" style="width:48px;height:48px;object-fit:cover;border-radius:3px;border:1px solid var(--line)">
        <span style="font-size:0.82rem;color:var(--ink-soft)">Foto actual asignada</span>
      </div>
    `;
  } else {
    previewBox.innerHTML = '<span style="font-size:0.82rem;color:var(--ink-soft)">Sin foto asignada</span>';
  }

  el('form-title').textContent = `Editando ítem ${it.id}`;
  el('save-btn').textContent = 'Guardar cambios';
  el('cancel-edit').style.display = 'inline-block';

  updateAdminMapForSala(it.sala_id, it.pos_x, it.pos_y);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  currentPhotoUrl = '';
  el('item-form').reset();
  el('item-original-id').value = '';
  el('imagen-actual-preview').innerHTML = '';
  el('form-title').textContent = 'Añadir ítem';
  el('save-btn').textContent = 'Guardar ítem';
  el('cancel-edit').style.display = 'none';
  el('admin-map-wrapper').style.display = 'none';
  el('f-tipo').value = 'MAYOR';
  el('f-funcionario').value = '';
  clearAdminMarker();
}

el('cancel-edit').addEventListener('click', resetForm);

el('item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
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

  if (!editingId && items.some(x => x.id === id)) {
    showStatus(statusBox, `Ya existe un ítem con el número ${id}.`, 'error');
    return;
  }

  try {
    showStatus(statusBox, 'Guardando elemento en el inventario…', 'info');

    let finalPhotoUrl = currentPhotoUrl;
    const fileInput = el('f-imagen');
    if (fileInput.files.length > 0) {
      showStatus(statusBox, 'Subiendo foto del equipo…', 'info');
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

    showStatus(statusBox, `Ítem ${id} guardado con éxito.`, 'ok');
    resetForm();
    await initAdminData();
  } catch (err) {
    showStatus(statusBox, err.message, 'error');
  }
});

async function deleteItem(id) {
  if (!confirm(`¿Eliminar definitivamente el ítem ${id} del inventario?`)) return;

  try {
    showStatus(statusBox, `Eliminando ítem ${id}…`, 'info');
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar el ítem');
    showStatus(statusBox, `Ítem ${id} eliminado correctamente.`, 'ok');
    await initAdminData();
  } catch (err) {
    showStatus(statusBox, err.message, 'error');
  }
}
window.deleteItem = deleteItem;

// =========================================================================
// === DISEÑADOR VISUAL DE PLANOS 2D DE SALAS ===
// =========================================================================

const canvas = el('designer-canvas');

// Actualizar tamaño de canvas al cambiar inputs
['s-ancho', 's-alto'].forEach(id => {
  el(id).addEventListener('input', updateCanvasSize);
});
el('s-nombre').addEventListener('input', (e) => {
  el('canvas-title-label').textContent = e.target.value || 'Plano de Sala';
});

function updateCanvasSize() {
  const w = parseInt(el('s-ancho').value) || 1000;
  const h = parseInt(el('s-alto').value) || 700;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

// Añadir elemento al plano
window.addCanvasItem = function(type) {
  const id = 'elem_' + (nextElementId++);
  let width = 200;
  let height = 90;
  let label = 'Mesa';

  switch (type) {
    case 'mesa':
      width = 220; height = 100; label = 'Mesa de Trabajo'; break;
    case 'computo':
      width = 200; height = 80; label = 'Puesto Cómputo'; break;
    case 'gabinete':
      width = 110; height = 180; label = 'Gabinete'; break;
    case 'rack':
      width = 90; height = 90; label = 'Rack Red'; break;
    case 'puerta':
      width = 90; height = 40; label = 'Puerta'; break;
    case 'ventana':
      width = 220; height = 20; label = 'Ventanal'; break;
    case 'telon':
      width = 260; height = 24; label = 'Telón Proyector'; break;
    case 'texto':
      width = 200; height = 40; label = 'Zona Técnica'; break;
  }

  // Posición inicial centrada en el canvas
  const canvasW = parseInt(canvas.style.width) || 1000;
  const canvasH = parseInt(canvas.style.height) || 700;
  const x = Math.max(20, Math.round(canvasW / 2 - width / 2 + (Math.random() * 40 - 20)));
  const y = Math.max(20, Math.round(canvasH / 2 - height / 2 + (Math.random() * 40 - 20)));

  const itemData = { id, type, x, y, width, height, rotation: 0, label };
  canvasElements.push(itemData);
  renderCanvasElements();
  selectCanvasItem(id);
};

window.clearCanvas = function() {
  if (canvasElements.length && !confirm('¿Vaciar todos los elementos del plano?')) return;
  canvasElements = [];
  selectedElementId = null;
  renderCanvasElements();
};

function selectCanvasItem(id) {
  selectedElementId = id;
  document.querySelectorAll('.canvas-element').forEach(node => {
    node.classList.toggle('selected', node.dataset.id === id);
  });
}

function renderCanvasElements() {
  // Mantener solo el título de la sala
  const title = el('canvas-title-label');
  canvas.innerHTML = '';
  canvas.appendChild(title);

  canvasElements.forEach(item => {
    const div = document.createElement('div');
    div.className = `canvas-element ${item.type} ${selectedElementId === item.id ? 'selected' : ''}`;
    div.dataset.id = item.id;
    div.style.left = `${item.x}px`;
    div.style.top = `${item.y}px`;
    div.style.width = `${item.width}px`;
    div.style.height = `${item.height}px`;

    // Controles flotantes para el elemento
    const controls = document.createElement('div');
    controls.className = 'elem-controls';
    controls.innerHTML = `
      <button type="button" class="elem-btn" title="Girar 90°" onclick="rotateCanvasItem('${item.id}', event)">🔄</button>
      <button type="button" class="elem-btn" title="Cambiar tamaño (ancho x alto)" onclick="resizeCanvasItem('${item.id}', event)">📐</button>
      <button type="button" class="elem-btn" title="Cambiar texto" onclick="renameCanvasItem('${item.id}', event)">✏️</button>
      <button type="button" class="elem-btn" title="Eliminar" onclick="deleteCanvasItem('${item.id}', event)">❌</button>
    `;
    div.appendChild(controls);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = item.label;
    div.appendChild(labelSpan);

    // Eventos de arrastre
    makeDraggable(div, item);

    div.addEventListener('click', (e) => {
      e.stopPropagation();
      selectCanvasItem(item.id);
    });

    canvas.appendChild(div);
  });
}

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
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      const canvasW = parseInt(canvas.style.width) || 1000;
      const canvasH = parseInt(canvas.style.height) || 700;

      let newX = Math.round((initLeft + dx) / 10) * 10; // Ajuste a rejilla de 10px
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
  e.stopPropagation();
  const item = canvasElements.find(x => x.id === id);
  if (!item) return;
  // Intercambiar ancho y alto
  const tmp = item.width;
  item.width = item.height;
  item.height = tmp;
  renderCanvasElements();
};

window.renameCanvasItem = function(id, e) {
  e.stopPropagation();
  const item = canvasElements.find(x => x.id === id);
  if (!item) return;
  const newText = prompt('Nuevo texto / identificación para este elemento:', item.label);
  if (newText !== null && newText.trim()) {
    item.label = newText.trim();
    renderCanvasElements();
  }
};

window.resizeCanvasItem = function(id, e) {
  e.stopPropagation();
  const item = canvasElements.find(x => x.id === id);
  if (!item) return;
  const currentSize = `${item.width}x${item.height}`;
  const input = prompt(`Dimensiones de "${item.label}" en píxeles (ancho x alto):`, currentSize);
  if (input) {
    const parts = input.toLowerCase().split(/[\s,xX*]+/);
    if (parts.length >= 2) {
      const nw = parseInt(parts[0]);
      const nh = parseInt(parts[1]);
      if (!isNaN(nw) && nw >= 20 && !isNaN(nh) && nh >= 15) {
        item.width = nw;
        item.height = nh;
        renderCanvasElements();
      }
    }
  }
};

window.deleteCanvasItem = function(id, e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  canvasElements = canvasElements.filter(x => x.id !== id);
  if (selectedElementId === id) {
    selectedElementId = null;
  }
  renderCanvasElements();
};

// Atajo de teclado: Teclas Supr / Delete / Backspace para eliminar el elemento seleccionado en el plano
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
    const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
      e.preventDefault();
      window.deleteCanvasItem(selectedElementId);
    }
  }
});
function parseSvgToCanvasElements(svgText, defaultW = 1000, defaultH = 700) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return { elements: [], width: defaultW, height: defaultH, title: '' };

    // 1. Dimensiones del plano
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

    // 2. Extraer título de la sala
    let salaTitle = '';
    const titleTexts = Array.from(doc.querySelectorAll('text')).filter(t => {
      const fs = parseFloat(t.getAttribute('font-size') || '14');
      const y = parseFloat(t.getAttribute('y') || '0');
      const txt = t.textContent.trim().toLowerCase();
      const isTitleKeyword = /laboratorio|sala de|oficina|auditorio|esquema arquitect[oó]nico|[aá]rea de sensores/.test(txt);
      return (fs >= 19 && y < 130) || (isTitleKeyword && y < 130);
    });
    if (titleTexts.length > 0) {
      salaTitle = titleTexts[0].textContent.trim();
    }

    // 3. Verificar si el SVG ya cuenta con metadatos JSON embebidos
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

    // 4. Extracción heurística de elementos SVG existentes
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

    // A) Grupos de elementos (<g id="...">)
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
      } else if (g.querySelector('path')) {
        const path = g.querySelector('path');
        const d = path.getAttribute('d') || '';
        const coords = d.match(/[-+]?[0-9]*\.?[0-9]+/g);
        let rx = 180, ry = 160, rw = 260, rh = 260;
        if (coords && coords.length >= 4) {
          rx = parseFloat(coords[0]) || 180;
          ry = parseFloat(coords[1]) || 160;
        }
        elements.push({
          id: gid || `elem_${elements.length + 1}`,
          type,
          label,
          x: Math.round(rx),
          y: Math.round(ry),
          width: rw,
          height: rh,
          rotation: 0
        });
      }
    });

    // B) Rectángulos directos / muebles sueltos
    const allRects = Array.from(doc.querySelectorAll('rect'));
    allRects.forEach((r, idx) => {
      if (r.closest('g') && !r.closest('g').id.startsWith('grid')) return;

      const rw = Math.round(parseFloat(r.getAttribute('width')) || 0);
      const rh = Math.round(parseFloat(r.getAttribute('height')) || 0);
      const rx = Math.round(parseFloat(r.getAttribute('x')) || 0);
      const ry = Math.round(parseFloat(r.getAttribute('y')) || 0);

      // Ignorar fondo y paredes perimetrales
      const isBackground = (rw >= w * 0.9 && rh >= h * 0.9);
      const isWall = (rx < 60 && ry < 60 && rw >= w * 0.8 && rh >= h * 0.8 && r.getAttribute('fill') === 'none');
      if (isBackground || isWall) return;

      // Buscar texto más cercano
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

    // C) Líneas de acceso / puertas / ventanales
    const allLines = Array.from(doc.querySelectorAll('line'));
    allLines.forEach(line => {
      if (line.closest('defs') || line.closest('pattern')) return;
      const lx1 = parseFloat(line.getAttribute('x1')) || 0;
      const ly1 = parseFloat(line.getAttribute('y1')) || 0;
      const lx2 = parseFloat(line.getAttribute('x2')) || 0;
      const ly2 = parseFloat(line.getAttribute('y2')) || 0;
      const lw = Math.round(Math.abs(lx2 - lx1)) || 20;
      const lh = Math.round(Math.abs(ly2 - ly1)) || 20;
      const lx = Math.round(Math.min(lx1, lx2));
      const ly = Math.round(Math.min(ly1, ly2));

      const allTexts = Array.from(doc.querySelectorAll('text'));
      for (const t of allTexts) {
        if (consumedTexts.has(t)) continue;
        const tx = parseFloat(t.getAttribute('x')) || 0;
        const ty = parseFloat(t.getAttribute('y')) || 0;
        if (Math.abs(tx - (lx + lw / 2)) < 140 && Math.abs(ty - (ly + lh / 2)) < 140) {
          const label = t.textContent.trim();
          consumedTexts.add(t);
          elements.push({
            id: `elem_${elements.length + 1}`,
            type: classify(label),
            label,
            x: lx,
            y: ly,
            width: Math.max(90, lw),
            height: Math.max(35, lh),
            rotation: 0
          });
          break;
        }
      }
    });

    return { elements, width: w, height: h, title: salaTitle };
  } catch (err) {
    console.error('Error parseando SVG de plano:', err);
    return { elements: [], width: defaultW, height: defaultH, title: '' };
  }
}

// Generador de código SVG vectorial a partir del lienzo de diseño
function compileCanvasToSvg(w, h, salaNombre) {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">\n`;
  svg += `  <defs>\n`;
  svg += `    <pattern id="grid_${Date.now()}" width="30" height="30" patternUnits="userSpaceOnUse">\n`;
  svg += `      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e5e0d3" stroke-width="1"/>\n`;
  svg += `    </pattern>\n`;
  svg += `  </defs>\n`;
  svg += `  <rect width="${w}" height="${h}" fill="#faf9f5"/>\n`;
  svg += `  <rect width="${w}" height="${h}" fill="url(#grid_${Date.now()})"/>\n`;
  svg += `  <!-- Paredes Exteriores -->\n`;
  svg += `  <rect x="20" y="20" width="${w - 40}" height="${h - 40}" fill="none" stroke="#2d3748" stroke-width="12" rx="6"/>\n`;
  svg += `  <!-- Título de la Sala -->\n`;
  svg += `  <text x="${w / 2}" y="65" font-family="sans-serif" font-size="22" font-weight="bold" fill="#1e293b" text-anchor="middle">${escapeHtml(salaNombre)}</text>\n`;
  svg += `  <!-- Metadatos de elementos para edición interactiva -->\n`;
  svg += `  <script type="application/json" id="canvas-elements-data">${JSON.stringify(canvasElements)}</script>\n`;

  // Renderizar cada elemento
  canvasElements.forEach(it => {
    const x = it.x;
    const y = it.y;
    const wE = it.width;
    const hE = it.height;
    const label = escapeHtml(it.label);

    switch (it.type) {
      case 'mesa':
        svg += `  <g id="${it.id}">\n`;
        svg += `    <rect x="${x}" y="${y}" width="${wE}" height="${hE}" rx="6" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>\n`;
        svg += `    <text x="${x + wE / 2}" y="${y + hE / 2 + 5}" font-family="sans-serif" font-size="13" font-weight="bold" fill="#1e293b" text-anchor="middle">${label}</text>\n`;
        svg += `  </g>\n`;
        break;
      case 'computo':
        svg += `  <g id="${it.id}">\n`;
        svg += `    <rect x="${x}" y="${y}" width="${wE}" height="${hE}" rx="5" fill="#eff6ff" stroke="#3b82f6" stroke-width="3"/>\n`;
        svg += `    <rect x="${x + wE / 2 - 25}" y="${y + 12}" width="50" height="28" rx="3" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>\n`;
        svg += `    <text x="${x + wE / 2}" y="${y + hE - 15}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1e3a8a" text-anchor="middle">${label}</text>\n`;
        svg += `  </g>\n`;
        break;
      case 'gabinete':
        svg += `  <g id="${it.id}">\n`;
        svg += `    <rect x="${x}" y="${y}" width="${wE}" height="${hE}" rx="4" fill="#d1fae5" stroke="#047857" stroke-width="3"/>\n`;
        svg += `    <text x="${x + wE / 2}" y="${y + hE / 2 + 5}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#064e3b" text-anchor="middle">${label}</text>\n`;
        svg += `  </g>\n`;
        break;
      case 'rack':
        svg += `  <g id="${it.id}">\n`;
        svg += `    <rect x="${x}" y="${y}" width="${wE}" height="${hE}" fill="#cbd5e1" stroke="#0f172a" stroke-width="3"/>\n`;
        svg += `    <text x="${x + wE / 2}" y="${y + hE / 2 + 5}" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0f172a" text-anchor="middle">${label}</text>\n`;
        svg += `  </g>\n`;
        break;
      case 'puerta':
        svg += `  <g id="${it.id}">\n`;
        svg += `    <line x1="${x}" y1="${y + hE}" x2="${x + wE}" y2="${y + hE}" stroke="#faf9f5" stroke-width="14"/>\n`;
        svg += `    <line x1="${x}" y1="${y + hE}" x2="${x}" y2="${y}" stroke="#475569" stroke-width="3"/>\n`;
        svg += `    <path d="M ${x} ${y + hE} A ${wE} ${hE} 0 0 1 ${x + wE} ${y}" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4,4"/>\n`;
        svg += `    <text x="${x + wE / 2}" y="${y + hE - 8}" font-family="sans-serif" font-size="11" fill="#475569" text-anchor="middle">${label}</text>\n`;
        svg += `  </g>\n`;
        break;
      case 'ventana':
        svg += `  <g id="${it.id}">\n`;
        svg += `    <rect x="${x}" y="${y}" width="${wE}" height="${hE}" fill="#dbeafe" stroke="#3182ce" stroke-width="3"/>\n`;
        svg += `    <text x="${x + wE / 2}" y="${y + hE / 2 + 4}" font-family="sans-serif" font-size="10" font-weight="bold" fill="#1e40af" text-anchor="middle">${label}</text>\n`;
        svg += `  </g>\n`;
        break;
      case 'telon':
        svg += `  <g id="${it.id}">\n`;
        svg += `    <rect x="${x}" y="${y}" width="${wE}" height="${hE}" rx="3" fill="#1d4ed8" stroke="#172554" stroke-width="2"/>\n`;
        svg += `    <text x="${x + wE / 2}" y="${y + hE + 16}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1d4ed8" text-anchor="middle">${label}</text>\n`;
        svg += `  </g>\n`;
        break;
      case 'texto':
        svg += `  <text x="${x + wE / 2}" y="${y + hE / 2 + 5}" font-family="sans-serif" font-size="15" font-weight="bold" fill="#334155" text-anchor="middle">${label}</text>\n`;
        break;
    }
  });

  svg += `</svg>`;
  return svg;
}

// Guardar Sala y Plano (Creado con el diseñador o subido)
el('sala-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = el('s-id').value.trim().toLowerCase().replace(/\s+/g, '_');
  const nombre = el('s-nombre').value.trim();
  const descripcion = el('s-desc').value.trim();
  const ancho = parseInt(el('s-ancho').value) || 1000;
  const alto = parseInt(el('s-alto').value) || 700;

  const fileInput = el('s-archivo-plano');

  try {
    showStatus(statusBox, 'Guardando plano de la sala…', 'info');

    // Opción A: Subir imagen raster (PNG/JPG) sin edición vectorial
    if (fileInput.files.length > 0 && !fileInput.files[0].name.toLowerCase().endsWith('.svg')) {
      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

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
      if (!res.ok) throw new Error('Error al guardar los datos de la sala');
    }
    // Opción B: Exportar el diseño vectorial interactivo generado en el lienzo (incluye elementos cargados de SVG existente o nuevos)
    else if (canvasElements.length > 0 || fileInput.files.length > 0 || !editingSalaId) {
      const svgContent = compileCanvasToSvg(ancho, alto, nombre);
      const res = await fetch('/api/salas/design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, nombre, descripcion, ancho, alto, svg_content: svgContent })
      });
      if (!res.ok) throw new Error('Error al guardar el plano diseñado');
    }
    // Opción C: Actualizar solo texto/metadatos de la sala
    else {
      const existingSala = salas.find(s => s.id === editingSalaId);
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
      if (!res.ok) throw new Error('Error al actualizar los datos de la sala');
    }

    showStatus(statusBox, `¡Sala "${nombre}" y plano guardados correctamente!`, 'ok');
    resetSalaForm();
    await initAdminData();
  } catch (err) {
    showStatus(statusBox, err.message, 'error');
  }
});

// Listener para cuando el usuario selecciona un archivo SVG desde su equipo
if (el('s-archivo-plano')) {
  el('s-archivo-plano').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.svg') || file.type.includes('svg')) {
      try {
        showStatus(statusBox, 'Procesando archivo SVG seleccionado…', 'info');
        const text = await file.text();
        const parsed = parseSvgToCanvasElements(text, parseInt(el('s-ancho').value) || 1000, parseInt(el('s-alto').value) || 700);
        if (parsed.elements.length > 0) {
          canvasElements = parsed.elements;
          nextElementId = canvasElements.length + 1;
          if (parsed.width) el('s-ancho').value = parsed.width;
          if (parsed.height) el('s-alto').value = parsed.height;
          if (parsed.title && !el('s-nombre').value) el('s-nombre').value = parsed.title;
          updateCanvasSize();
          renderCanvasElements();
          showStatus(statusBox, `Se extrajeron ${parsed.elements.length} elementos interactivos del archivo SVG. Ya puedes moverlos y editarlos en el lienzo.`, 'ok');
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
  el('sala-form-title').textContent = 'Diseñador Visual de Planos de Sala 2D';
  el('btn-save-sala').textContent = '💾 Guardar Plano y Sala';
  el('btn-cancel-sala-edit').style.display = 'none';

  // Restaurar cuadrícula del lienzo
  canvas.style.backgroundImage = `
    linear-gradient(to right, #ece7da 1px, transparent 1px),
    linear-gradient(to bottom, #ece7da 1px, transparent 1px)
  `;
  canvas.style.backgroundSize = '30px 30px';
  canvas.style.backgroundRepeat = 'repeat';

  updateCanvasSize();
  canvasElements = [];
  selectedElementId = null;
  el('canvas-title-label').textContent = 'Plano de Sala';
  renderCanvasElements();
}

el('btn-reset-sala').addEventListener('click', resetSalaForm);
el('btn-cancel-sala-edit').addEventListener('click', resetSalaForm);

// ---------- Listado de Salas Existentes y Edición ----------

window.startEditSala = async function(salaId) {
  const sala = salas.find(s => s.id === salaId);
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

  // Restaurar cuadrícula limpia en el lienzo para que los elementos sean interactivos
  canvas.style.backgroundImage = `
    linear-gradient(to right, #ece7da 1px, transparent 1px),
    linear-gradient(to bottom, #ece7da 1px, transparent 1px)
  `;
  canvas.style.backgroundSize = '30px 30px';
  canvas.style.backgroundRepeat = 'repeat';

  showStatus(statusBox, `Cargando plano vectorial de "${sala.nombre}"…`, 'info');

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
        nextElementId = canvasElements.length + 1;
        selectedElementId = null;
        renderCanvasElements();

        showStatus(statusBox, `¡Plano listo! Se cargaron ${canvasElements.length} elementos interactivos. Ahora puedes arrastrar mesas, puestos o puertas, rotarlos (🔄), cambiar su tamaño (📐) o editarlos.`, 'ok');
      } else {
        throw new Error('No se pudo descargar el archivo SVG');
      }
    } else {
      // Si es formato imagen raster (PNG/JPG)
      canvas.style.backgroundImage = `url('${sala.plano_imagen}?t=${Date.now()}')`;
      canvas.style.backgroundSize = '100% 100%';
      canvas.style.backgroundRepeat = 'no-repeat';
      canvasElements = [];
      selectedElementId = null;
      renderCanvasElements();
      showStatus(statusBox, 'Plano raster cargado como fondo. Puedes añadir muebles y puestos encima.', 'info');
    }
  } catch (err) {
    console.warn('Error cargando elementos SVG:', err);
    canvas.style.backgroundImage = `url('${sala.plano_imagen}?t=${Date.now()}')`;
    canvas.style.backgroundSize = '100% 100%';
    canvas.style.backgroundRepeat = 'no-repeat';
    canvasElements = [];
    selectedElementId = null;
    renderCanvasElements();
    showStatus(statusBox, 'Se cargó el plano en modo estático de fondo.', 'info');
  }

  el('sala-form').scrollIntoView({ behavior: 'smooth' });
};

function renderSalasGrid() {
  const container = el('salas-list');
  if (!container) return;

  if (!salas.length) {
    container.innerHTML = '<p style="color:var(--ink-soft)">No hay salas creadas aún.</p>';
    return;
  }

  container.innerHTML = salas.map(s => {
    const itemsCount = items.filter(it => it.sala_id === s.id).length;
    return `
      <div class="sala-card">
        <div>
          <img class="sala-card-thumb" src="${escapeHtml(s.plano_imagen)}?t=${Date.now()}" alt="${escapeHtml(s.nombre)}">
          <h3>${escapeHtml(s.nombre)}</h3>
          <p>${escapeHtml(s.descripcion || 'Sin descripción')}</p>
          <div style="font-size:0.8rem;color:var(--ink-soft);font-family:var(--mono)">
            📐 ${s.ancho} × ${s.alto} px · 📦 ${itemsCount} equipos en sala
          </div>
        </div>
        <div class="sala-card-actions">
          <button type="button" class="ghost" onclick="startEditSala('${escapeHtml(s.id)}')">✏️ Editar / Modificar Plano</button>
          <button type="button" class="danger" onclick="deleteSala('${escapeHtml(s.id)}')">🗑️ Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

window.deleteSala = async function(salaId) {
  if (!confirm(`¿Eliminar la sala "${salaId}"? Los equipos que estaban en ella no se borrarán, pero perderán su ubicación en el plano.`)) return;

  try {
    showStatus(statusBox, `Eliminando sala ${salaId}…`, 'info');
    const res = await fetch(`/api/salas/${salaId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('No se pudo eliminar la sala');

    showStatus(statusBox, 'Sala eliminada.', 'ok');
    await initAdminData();
  } catch (err) {
    showStatus(statusBox, err.message, 'error');
  }
};

// Arranque / Verificación de sesión previa
(function checkLogin() {
  const remembered = sessionStorage.getItem('inv-auth-user');
  if (remembered) {
    try {
      loggedUser = JSON.parse(remembered);
      enterAdmin();
    } catch {
      sessionStorage.removeItem('inv-auth-user');
    }
  }
})();

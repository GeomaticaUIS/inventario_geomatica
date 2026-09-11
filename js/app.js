// js/app.js · Lógica del Visor Público de Inventario y Esquemas 2D (Geomática UIS)

// Estado Global
let allItems = [];
let allSalas = [];
let currentSalaId = null;
let currentView = 'tabla'; // 'tabla' | 'mapa'
let indoorMap = null;
let mapImageOverlay = null;
let mapMarkers = [];
let activeKpiFilter = ''; // '' | 'MAYOR' | 'MENOR' | 'INTANGIBLE' | 'PLANO'

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
  const t = (tipo || '').toLowerCase();
  return 'badge ' + t;
}

// Sistema de Notificaciones Toasts
function showToast(msg, type = 'ok') {
  const container = document.getElementById('toast-container');
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

// Función para copiar No. de Inventario al portapapeles
window.copyInventoryId = function(id, e) {
  if (e) e.stopPropagation();
  navigator.clipboard.writeText(String(id)).then(() => {
    showToast(`No. de inventario ${id} copiado al portapapeles`, 'ok');
  }).catch(() => {
    showToast(`Código: ${id}`, 'info');
  });
};

// Renderizado de miniaturas con manejo seguro de errores
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

// Carga de datos desde la API local
async function loadData() {
  const [resItems, resSalas] = await Promise.all([
    fetch('/api/items', { cache: 'no-store' }),
    fetch('/api/salas', { cache: 'no-store' })
  ]);

  if (!resItems.ok || !resSalas.ok) {
    throw new Error('Error al conectar con la API de inventario');
  }

  allItems = await resItems.json();
  allSalas = await resSalas.json();

  if (allSalas.length > 0 && !currentSalaId) {
    currentSalaId = allSalas[0].id;
  }

  updateKpiDashboard();
}

// Actualizar Mini-Dashboard de Estadísticas
function updateKpiDashboard() {
  const total = allItems.length;
  const mayor = allItems.filter(x => (x.tipo_inventario || '').toUpperCase() === 'MAYOR').length;
  const menor = allItems.filter(x => (x.tipo_inventario || '').toUpperCase() === 'MENOR').length;
  const intangible = allItems.filter(x => (x.tipo_inventario || '').toUpperCase() === 'INTANGIBLE').length;
  const plano = allItems.filter(x => x.sala_id && x.pos_x !== null && x.pos_y !== null).length;

  const setVal = (id, val) => {
    const node = document.getElementById(id);
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
  const selTipo = document.getElementById('filter-tipo');
  if (selTipo) selTipo.value = tipo;

  // Actualizar tarjetas activas
  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
  if (tipo === 'MAYOR') document.getElementById('kpi-card-mayor')?.classList.add('active');
  else if (tipo === 'MENOR') document.getElementById('kpi-card-menor')?.classList.add('active');
  else if (tipo === 'INTANGIBLE') document.getElementById('kpi-card-intangible')?.classList.add('active');
  else document.getElementById('kpi-card-all')?.classList.add('active');

  renderTable();
};

window.quickFilterPlano = function() {
  activeKpiFilter = (activeKpiFilter === 'PLANO') ? '' : 'PLANO';
  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
  if (activeKpiFilter === 'PLANO') {
    document.getElementById('kpi-card-plano')?.classList.add('active');
  } else {
    document.getElementById('kpi-card-all')?.classList.add('active');
  }
  renderTable();
};

// Renderizado de la tabla con filtros
function renderTable() {
  const tbody = document.getElementById('rows');
  const search = document.getElementById('search').value.trim().toLowerCase();
  const tipo = document.getElementById('filter-tipo').value.trim().toUpperCase();
  const funcionario = document.getElementById('filter-funcionario').value;
  const sala = document.getElementById('filter-sala').value;

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

  document.getElementById('count').textContent = `${filtered.length} de ${allItems.length} ítems`;

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td class="empty" colspan="7" style="text-align:center;padding:32px 16px;color:var(--text-soft)">
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
      </tr>
    `;
  }).join('');
}

// Inicialización de selectores de filtro
function populateFilters() {
  // 1. Funcionarios / Responsables
  const selFunc = document.getElementById('filter-funcionario');
  selFunc.innerHTML = '<option value="">Todos los responsables</option>';
  const funcionarios = [...new Set(allItems.map(it => it.funcionario).filter(Boolean))].sort();
  funcionarios.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    selFunc.appendChild(opt);
  });

  // 2. Salas en filtros generales
  const selSala = document.getElementById('filter-sala');
  selSala.innerHTML = '<option value="">Todas las salas</option>';
  allSalas.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nombre;
    selSala.appendChild(opt);
  });

  // 3. Salas en selector del mapa Leaflet
  const selMapSala = document.getElementById('map-sala-select');
  selMapSala.innerHTML = '';
  allSalas.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.nombre;
    selMapSala.appendChild(opt);
  });
  if (currentSalaId) selMapSala.value = currentSalaId;
}

// Limpiar todos los filtros
window.clearFilters = function() {
  document.getElementById('search').value = '';
  document.getElementById('filter-tipo').value = '';
  document.getElementById('filter-funcionario').value = '';
  document.getElementById('filter-sala').value = '';
  activeKpiFilter = '';
  document.querySelectorAll('.kpi-card').forEach(c => c.classList.remove('active'));
  document.getElementById('kpi-card-all')?.classList.add('active');
  renderTable();
};

// --- Vista de Esquema de Sala con Leaflet CRS.Simple ---

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

  // Actualizar Ficha Informativa de la Sala
  const titleEl = document.getElementById('map-sala-title');
  const descEl = document.getElementById('map-sala-desc');
  if (titleEl) titleEl.textContent = sala.nombre;
  if (descEl) descEl.textContent = `${sala.descripcion || 'Sin descripción'} · Dimensiones: ${sala.ancho}×${sala.alto} px`;

  // Limpiar marcadores y capa anterior
  mapMarkers.forEach(m => indoorMap.removeLayer(m));
  mapMarkers = [];
  if (mapImageOverlay) {
    indoorMap.removeLayer(mapImageOverlay);
    mapImageOverlay = null;
  }

  const w = sala.ancho || 1000;
  const h = sala.alto || 700;
  const bounds = [[0, 0], [h, w]];

  // Cargar imagen de plano esquemático
  mapImageOverlay = L.imageOverlay(sala.plano_imagen, bounds).addTo(indoorMap);
  indoorMap.fitBounds(bounds);

  // Filtrar ítems pertenecientes a esta sala que tengan coordenadas
  const itemsEnSala = allItems.filter(it => it.sala_id === sala.id && it.pos_x !== null && it.pos_y !== null);

  // Actualizar selector de items dentro de la sala
  const selItemMap = document.getElementById('map-item-select');
  if (selItemMap) {
    selItemMap.innerHTML = '<option value="">🎯 Enfocar equipo en el plano…</option>';
    itemsEnSala.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = `[${it.id}] ${it.descripcion}`;
      selItemMap.appendChild(opt);
    });
  }

  // Contadores de la leyenda
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
        </div>
      </div>
    `;

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(indoorMap);
    marker.bindPopup(popupContent);
    marker.itemId = strId;
    mapMarkers.push(marker);
  });

  // Actualizar conteos de la leyenda
  const legMayor = document.getElementById('leg-count-mayor');
  const legMenor = document.getElementById('leg-count-menor');
  const legInt = document.getElementById('leg-count-intangible');
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
    document.getElementById('map-sala-select').value = it.sala_id;
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

      // Animación de pulso en el pin
      const pinEl = document.getElementById(`pin-${strId}`);
      if (pinEl) {
        pinEl.classList.add('selected');
        setTimeout(() => pinEl.classList.remove('selected'), 3000);
      }
    }
  }, 250);
};

// Cambio de vistas (Tabla vs Mapa)
function switchView(view) {
  currentView = view;
  const btnTabla = document.getElementById('btn-view-tabla');
  const btnMapa = document.getElementById('btn-view-mapa');
  const secTabla = document.getElementById('table-view-section');
  const secMapa = document.getElementById('map-view-section');

  if (view === 'tabla') {
    btnTabla.classList.add('active');
    btnMapa.classList.remove('active');
    secTabla.style.display = 'block';
    secMapa.style.display = 'none';
  } else {
    btnMapa.classList.add('active');
    btnTabla.classList.remove('active');
    secTabla.style.display = 'none';
    secMapa.style.display = 'block';

    initIndoorMap();
    setTimeout(() => {
      indoorMap.invalidateSize();
      if (currentSalaId) renderSalaOnMap(currentSalaId);
    }, 150);
  }
}

// Modal de Fotos
window.openPhotoModal = function(imgSrc, title) {
  document.getElementById('modal-img').src = imgSrc;
  document.getElementById('modal-title').textContent = title || 'Foto del Equipo';
  document.getElementById('photo-modal').classList.add('show');
};

window.closePhotoModal = function() {
  document.getElementById('photo-modal').classList.remove('show');
  document.getElementById('modal-img').src = '';
};

// Event Listeners y Arranque
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadData();
    populateFilters();
    renderTable();

    // Filtros reactivos en tiempo real
    ['search', 'filter-tipo', 'filter-funcionario', 'filter-sala'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => renderTable());
        el.addEventListener('change', () => renderTable());
      }
    });

    // Botón limpiar filtros
    document.getElementById('btn-clear-filters')?.addEventListener('click', clearFilters);

    // Cambio de sala en el mapa
    document.getElementById('map-sala-select')?.addEventListener('change', (e) => {
      renderSalaOnMap(e.target.value);
    });

    // Selector de enfocar equipo dentro del mapa
    document.getElementById('map-item-select')?.addEventListener('change', (e) => {
      if (e.target.value) focusItemOnMap(e.target.value);
    });

    // Botón centrar mapa
    document.getElementById('btn-center-map')?.addEventListener('click', centerMapOnBounds);

    // Botones de cambio de vista
    document.getElementById('btn-view-tabla')?.addEventListener('click', () => switchView('tabla'));
    document.getElementById('btn-view-mapa')?.addEventListener('click', () => switchView('mapa'));

    // Modal de fotos
    document.getElementById('modal-close-btn')?.addEventListener('click', closePhotoModal);
    document.getElementById('photo-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'photo-modal') closePhotoModal();
    });

    // Tecla ESC para cerrar modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePhotoModal();
    });

  } catch (err) {
    document.getElementById('rows').innerHTML = `
      <tr>
        <td class="empty" colspan="7" style="color:#dc2626;padding:24px;text-align:center">
          ⚠️ <strong>Error cargando inventario:</strong> ${escapeHtml(err.message)}
        </td>
      </tr>
    `;
  }
});

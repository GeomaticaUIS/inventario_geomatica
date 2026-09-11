// Estado global
let allItems = [];
let allSalas = [];
let currentSalaId = null;
let currentView = 'tabla'; // 'tabla' | 'mapa'
let indoorMap = null;
let mapImageOverlay = null;
let mapMarkers = [];

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
}

// Renderizado de la tabla
function renderTable() {
  const tbody = document.getElementById('rows');
  const search = document.getElementById('search').value.trim().toLowerCase();
  const tipo = document.getElementById('filter-tipo').value;
  const funcionario = document.getElementById('filter-funcionario').value;
  const sala = document.getElementById('filter-sala').value;

  const filtered = allItems.filter(it => {
    const matchesSearch = !search || [it.id, it.descripcion, it.ubicacion, it.observacion, it.funcionario, it.sala_nombre]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(search));
    const matchesTipo = !tipo || it.tipo_inventario === tipo;
    const matchesFuncionario = !funcionario || it.funcionario === funcionario;
    const matchesSala = !sala || it.sala_id === sala;
    return matchesSearch && matchesTipo && matchesFuncionario && matchesSala;
  });

  document.getElementById('count').textContent = `${filtered.length} de ${allItems.length} ítems`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td class="empty" colspan="7">No hay ítems que coincidan con la búsqueda.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(it => {
    const imgHtml = it.imagen
      ? `<img class="thumb" src="${escapeHtml(it.imagen)}" alt="${escapeHtml(it.descripcion)}" loading="lazy"
              onclick="openPhotoModal('${escapeHtml(it.imagen)}', '${escapeHtml(it.id)} - ${escapeHtml(it.descripcion)}')"
              onerror="this.outerHTML='<div class=&quot;thumb thumb-empty&quot;></div>'">`
      : `<div class="thumb thumb-empty"></div>`;

    const salaBadge = it.sala_nombre
      ? `<span class="badge-sala">${escapeHtml(it.sala_nombre)}</span>`
      : '';

    const btnPlano = it.sala_id && it.pos_x !== null && it.pos_y !== null
      ? `<button type="button" class="ghost" style="padding:4px 8px;font-size:0.78rem" onclick="focusItemOnMap('${escapeHtml(it.id)}')">📍 Ver</button>`
      : `<span style="color:var(--ink-soft);font-size:0.8rem">—</span>`;

    return `
      <tr>
        <td>${imgHtml}</td>
        <td class="id">${escapeHtml(it.id)}</td>
        <td>
          <strong>${escapeHtml(it.descripcion)}</strong>
          ${it.observacion ? `<br><span style="color:var(--ink-soft);font-size:0.82rem">${escapeHtml(it.observacion)}</span>` : ''}
        </td>
        <td>
          ${escapeHtml(it.ubicacion || '')}
          ${salaBadge ? `<br>${salaBadge}` : ''}
        </td>
        <td><span class="${tipoBadgeClass(it.tipo_inventario)}">${escapeHtml(it.tipo_inventario)}</span></td>
        <td>${escapeHtml(it.funcionario || '—')}</td>
        <td style="text-align:center">${btnPlano}</td>
      </tr>
    `;
  }).join('');
}

// Inicialización de selectores de filtro
function populateFilters() {
  // 1. Funcionarios
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

  // 3. Salas en selector del mapa
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

function renderSalaOnMap(salaId) {
  if (!indoorMap) return;
  const sala = allSalas.find(s => s.id === salaId);
  if (!sala) return;

  currentSalaId = salaId;

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

  itemsEnSala.forEach(it => {
    // Coordenadas Leaflet CRS.Simple: [lat, lng] -> [alto - Y, X]
    const lat = h - it.pos_y;
    const lng = it.pos_x;

    const tipoClass = (it.tipo_inventario || 'mayor').toLowerCase();
    const pinHtml = `<div class="custom-pin ${tipoClass}" title="${escapeHtml(it.id)}">${escapeHtml(it.id.slice(-4))}</div>`;

    const customIcon = L.divIcon({
      html: pinHtml,
      className: 'custom-pin-container',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });

    const imgPopup = it.imagen
      ? `<img src="${escapeHtml(it.imagen)}" alt="${escapeHtml(it.descripcion)}"
              onclick="openPhotoModal('${escapeHtml(it.imagen)}', '${escapeHtml(it.id)} - ${escapeHtml(it.descripcion)}')"
              onerror="this.style.display='none'">`
      : '';

    const popupContent = `
      <div class="popup-card">
        ${imgPopup}
        <h4>No. ${escapeHtml(it.id)}</h4>
        <p><strong>${escapeHtml(it.descripcion)}</strong></p>
        ${it.ubicacion ? `<p>📍 ${escapeHtml(it.ubicacion)}</p>` : ''}
        ${it.observacion ? `<p style="font-style:italic;color:var(--ink-soft)">${escapeHtml(it.observacion)}</p>` : ''}
        <div class="popup-footer">
          <span class="badge ${tipoClass}">${escapeHtml(it.tipo_inventario)}</span>
          <span style="font-size:0.8rem;color:var(--ink-soft)">👤 ${escapeHtml(it.funcionario || 'N/A')}</span>
        </div>
      </div>
    `;

    const marker = L.marker([lat, lng], { icon: customIcon }).addTo(indoorMap);
    marker.bindPopup(popupContent);
    marker.itemId = it.id;
    mapMarkers.push(marker);
  });
}

function focusItemOnMap(itemId) {
  const it = allItems.find(x => x.id === itemId);
  if (!it || !it.sala_id) return;

  switchView('mapa');

  // Si la sala seleccionada es distinta, cambiar
  if (currentSalaId !== it.sala_id) {
    document.getElementById('map-sala-select').value = it.sala_id;
    renderSalaOnMap(it.sala_id);
  }

  setTimeout(() => {
    const marker = mapMarkers.find(m => m.itemId === itemId);
    if (marker) {
      const sala = allSalas.find(s => s.id === it.sala_id);
      const h = sala ? sala.alto : 700;
      const lat = h - it.pos_y;
      const lng = it.pos_x;

      indoorMap.setView([lat, lng], 0.5, { animate: true });
      marker.openPopup();
    }
  }, 250);
}

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
function openPhotoModal(imgSrc, title) {
  document.getElementById('modal-img').src = imgSrc;
  document.getElementById('modal-title').textContent = title || 'Foto del Equipo';
  document.getElementById('photo-modal').classList.add('show');
}

function closePhotoModal() {
  document.getElementById('photo-modal').classList.remove('show');
  document.getElementById('modal-img').src = '';
}

// Event Listeners y Arranque
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadData();
    populateFilters();
    renderTable();

    // Filtros de búsqueda
    ['search', 'filter-tipo', 'filter-funcionario', 'filter-sala'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => renderTable());
      document.getElementById(id).addEventListener('change', () => renderTable());
    });

    // Cambio de sala en el mapa
    document.getElementById('map-sala-select').addEventListener('change', (e) => {
      renderSalaOnMap(e.target.value);
    });

    // Botones de cambio de vista
    document.getElementById('btn-view-tabla').addEventListener('click', () => switchView('tabla'));
    document.getElementById('btn-view-mapa').addEventListener('click', () => switchView('mapa'));

    // Modal de fotos
    document.getElementById('modal-close-btn').addEventListener('click', closePhotoModal);
    document.getElementById('photo-modal').addEventListener('click', (e) => {
      if (e.target.id === 'photo-modal') closePhotoModal();
    });

  } catch (err) {
    document.getElementById('rows').innerHTML =
      `<tr><td class="empty" colspan="7">Error cargando el inventario: ${escapeHtml(err.message)}</td></tr>`;
  }
});

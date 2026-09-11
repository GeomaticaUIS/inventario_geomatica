async function loadItems() {
  const res = await fetch('data/items.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('No se pudo cargar data/items.json');
  return res.json();
}

function tipoBadgeClass(tipo) {
  return 'badge ' + (tipo || '').toLowerCase();
}

function thumb(it) {
  if (!it.imagen) {
    return `<div class="thumb thumb-empty"></div>`;
  }
  return `<img class="thumb" src="${it.imagen}" alt="${it.descripcion}" loading="lazy"
            onerror="this.outerHTML='<div class=&quot;thumb thumb-empty&quot;></div>'">`;
}

function render(items) {
  const tbody = document.getElementById('rows');
  const search = document.getElementById('search').value.trim().toLowerCase();
  const tipo = document.getElementById('filter-tipo').value;
  const funcionario = document.getElementById('filter-funcionario').value;

  const filtered = items.filter(it => {
    const matchesSearch = !search || [it.id, it.descripcion, it.ubicacion, it.observacion]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(search));
    const matchesTipo = !tipo || it.tipo_inventario === tipo;
    const matchesFuncionario = !funcionario || it.funcionario === funcionario;
    return matchesSearch && matchesTipo && matchesFuncionario;
  });

  document.getElementById('count').textContent = `${filtered.length} de ${items.length} ítems`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td class="empty" colspan="6">No hay ítems que coincidan con la búsqueda.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(it => `
    <tr>
      <td>${thumb(it)}</td>
      <td class="id">${it.id}</td>
      <td>${it.descripcion}${it.observacion ? `<br><span style="color:var(--ink-soft);font-size:0.85rem">${it.observacion}</span>` : ''}</td>
      <td>${it.ubicacion || ''}</td>
      <td><span class="${tipoBadgeClass(it.tipo_inventario)}">${it.tipo_inventario}</span></td>
      <td>${it.funcionario || ''}</td>
    </tr>
  `).join('');
}

function populateFuncionarioFilter(items) {
  const select = document.getElementById('filter-funcionario');
  const funcionarios = [...new Set(items.map(it => it.funcionario).filter(Boolean))].sort();
  funcionarios.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    select.appendChild(opt);
  });
}

(async () => {
  try {
    const items = await loadItems();
    populateFuncionarioFilter(items);
    render(items);
    ['search', 'filter-tipo', 'filter-funcionario'].forEach(id =>
      document.getElementById(id).addEventListener('input', () => render(items))
    );
  } catch (err) {
    document.getElementById('rows').innerHTML =
      `<tr><td class="empty" colspan="6">Error cargando el inventario: ${err.message}</td></tr>`;
  }
})();

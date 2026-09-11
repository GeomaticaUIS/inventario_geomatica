import os

os.makedirs('uploads/planos', exist_ok=True)
os.makedirs('uploads/fotos', exist_ok=True)

# 1. Oficina Rectoria (1000 x 700)
svg_rectoria = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" width="1000" height="700">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e0d3" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1000" height="700" fill="#faf9f5"/>
  <rect width="1000" height="700" fill="url(#grid)"/>

  <rect x="50" y="50" width="900" height="600" fill="none" stroke="#2d3748" stroke-width="12" rx="6"/>

  <line x1="450" y1="650" x2="550" y2="650" stroke="#faf9f5" stroke-width="14"/>
  <path d="M 450 650 A 100 100 0 0 1 550 550" fill="none" stroke="#718096" stroke-width="2" stroke-dasharray="4,4"/>
  <line x1="450" y1="650" x2="450" y2="550" stroke="#a0aec0" stroke-width="3"/>
  <text x="500" y="685" font-family="sans-serif" font-size="14" fill="#718096" text-anchor="middle">Acceso Principal</text>

  <line x1="250" y1="50" x2="750" y2="50" stroke="#63b3ed" stroke-width="10"/>
  <text x="500" y="40" font-family="sans-serif" font-size="13" fill="#3182ce" text-anchor="middle">Ventanal</text>

  <g id="escritorio-rector">
    <path d="M 180 160 h 260 v 110 h -120 v 150 h -140 z" fill="#e2e8f0" stroke="#4a5568" stroke-width="3"/>
    <rect x="220" y="200" width="70" height="45" rx="4" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>
    <text x="255" y="228" font-family="sans-serif" font-size="11" fill="#334155" text-anchor="middle">Laptop</text>
    <circle cx="255" cy="320" r="26" fill="#94a3b8" stroke="#475569" stroke-width="2"/>
    <text x="250" y="190" font-family="sans-serif" font-weight="bold" font-size="14" fill="#1e293b">Escritorio Principal</text>
  </g>

  <circle cx="360" cy="340" r="20" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>
  <circle cx="420" cy="340" r="20" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>

  <g id="mesa-reuniones">
    <rect x="600" y="220" width="260" height="160" rx="25" fill="#e2e8f0" stroke="#4a5568" stroke-width="3"/>
    <text x="730" y="305" font-family="sans-serif" font-weight="bold" font-size="15" fill="#334155" text-anchor="middle">Mesa de Juntas</text>
    <circle cx="660" cy="185" r="18" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>
    <circle cx="730" cy="185" r="18" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>
    <circle cx="800" cy="185" r="18" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>
    <circle cx="660" cy="415" r="18" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>
    <circle cx="730" cy="415" r="18" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>
    <circle cx="800" cy="415" r="18" fill="#cbd5e1" stroke="#64748b" stroke-width="2"/>
  </g>

  <rect x="70" y="460" width="60" height="150" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
  <text x="100" y="540" font-family="sans-serif" font-size="12" fill="#334155" transform="rotate(-90, 100, 540)" text-anchor="middle">Archivador</text>

  <text x="500" y="100" font-family="sans-serif" font-size="22" font-weight="bold" fill="#1e293b" text-anchor="middle">Oficina Rectoría</text>
  <text x="500" y="125" font-family="sans-serif" font-size="13" fill="#64748b" text-anchor="middle">Esquema Arquitectónico</text>
</svg>'''

with open('uploads/planos/oficina_rectoria.svg', 'w', encoding='utf-8') as f:
    f.write(svg_rectoria)

# 2. Sala de Sistemas (1200 x 800)
svg_sistemas = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <defs>
    <pattern id="grid2" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e0d3" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="800" fill="#faf9f5"/>
  <rect width="1200" height="800" fill="url(#grid2)"/>

  <rect x="50" y="50" width="1100" height="700" fill="none" stroke="#2d3748" stroke-width="12" rx="6"/>

  <line x1="1150" y1="600" x2="1150" y2="700" stroke="#faf9f5" stroke-width="14"/>
  <path d="M 1150 700 A 100 100 0 0 1 1050 600" fill="none" stroke="#718096" stroke-width="2" stroke-dasharray="4,4"/>
  <line x1="1150" y1="700" x2="1050" y2="700" stroke="#a0aec0" stroke-width="3"/>
  <text x="1110" y="735" font-family="sans-serif" font-size="14" fill="#718096" text-anchor="middle">Acceso</text>

  <rect x="450" y="55" width="300" height="16" fill="#3182ce" rx="3"/>
  <text x="600" y="95" font-family="sans-serif" font-weight="bold" font-size="14" fill="#2b6cb0" text-anchor="middle">Telón de Proyección</text>

  <rect x="160" y="130" width="200" height="80" fill="#e2e8f0" stroke="#4a5568" stroke-width="3" rx="4"/>
  <text x="260" y="175" font-family="sans-serif" font-weight="bold" font-size="14" fill="#2d3748" text-anchor="middle">Puesto Docente</text>
  <circle cx="260" cy="240" r="22" fill="#94a3b8" stroke="#475569" stroke-width="2"/>

  <rect x="160" y="320" width="380" height="90" rx="6" fill="#e2e8f0" stroke="#4a5568" stroke-width="2"/>
  <text x="350" y="370" font-family="sans-serif" font-weight="bold" font-size="14" fill="#4a5568" text-anchor="middle">Mesa de Cómputo A (1-4)</text>

  <rect x="660" y="320" width="380" height="90" rx="6" fill="#e2e8f0" stroke="#4a5568" stroke-width="2"/>
  <text x="850" y="370" font-family="sans-serif" font-weight="bold" font-size="14" fill="#4a5568" text-anchor="middle">Mesa de Cómputo B (5-8)</text>

  <rect x="160" y="490" width="380" height="90" rx="6" fill="#e2e8f0" stroke="#4a5568" stroke-width="2"/>
  <text x="350" y="540" font-family="sans-serif" font-weight="bold" font-size="14" fill="#4a5568" text-anchor="middle">Mesa de Cómputo C (9-12)</text>

  <rect x="660" y="490" width="380" height="90" rx="6" fill="#e2e8f0" stroke="#4a5568" stroke-width="2"/>
  <text x="850" y="540" font-family="sans-serif" font-weight="bold" font-size="14" fill="#4a5568" text-anchor="middle">Mesa de Cómputo D (13-16)</text>

  <rect x="70" y="620" width="90" height="90" fill="#cbd5e1" stroke="#2d3748" stroke-width="3"/>
  <text x="115" y="670" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1e293b" text-anchor="middle">Rack Red</text>

  <text x="600" y="35" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1a202c" text-anchor="middle">Sala de Sistemas</text>
</svg>'''

with open('uploads/planos/sala_sistemas.svg', 'w', encoding='utf-8') as f:
    f.write(svg_sistemas)

# 3. Laboratorio de Geomatica (1200 x 800)
svg_geomatica = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <defs>
    <pattern id="grid3" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e0d3" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="800" fill="#faf9f5"/>
  <rect width="1200" height="800" fill="url(#grid3)"/>
  <rect x="50" y="50" width="1100" height="700" fill="none" stroke="#204c40" stroke-width="12" rx="6"/>

  <line x1="550" y1="750" x2="650" y2="750" stroke="#faf9f5" stroke-width="14"/>
  <path d="M 550 750 A 100 100 0 0 1 650 650" fill="none" stroke="#718096" stroke-width="2" stroke-dasharray="4,4"/>
  <text x="600" y="785" font-family="sans-serif" font-size="14" fill="#718096" text-anchor="middle">Acceso Principal</text>

  <rect x="70" y="100" width="120" height="220" fill="#d1fae5" stroke="#065f46" stroke-width="3" rx="4"/>
  <text x="130" y="200" font-family="sans-serif" font-weight="bold" font-size="13" fill="#064e3b" transform="rotate(-90, 130, 200)" text-anchor="middle">Gabinete Estaciones / GNSS</text>

  <rect x="70" y="380" width="120" height="220" fill="#d1fae5" stroke="#065f46" stroke-width="3" rx="4"/>
  <text x="130" y="490" font-family="sans-serif" font-weight="bold" font-size="13" fill="#064e3b" transform="rotate(-90, 130, 490)" text-anchor="middle">Gabinete Drones / Fotogrametría</text>

  <rect x="280" y="180" width="340" height="160" rx="8" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>
  <text x="450" y="265" font-family="sans-serif" font-weight="bold" font-size="16" fill="#1e293b" text-anchor="middle">Mesa de Calibración 1</text>

  <rect x="700" y="180" width="340" height="160" rx="8" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>
  <text x="870" y="265" font-family="sans-serif" font-weight="bold" font-size="16" fill="#1e293b" text-anchor="middle">Mesa de Trabajo 2</text>

  <rect x="280" y="450" width="760" height="150" rx="8" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>
  <text x="660" y="530" font-family="sans-serif" font-weight="bold" font-size="16" fill="#1e293b" text-anchor="middle">Estaciones de Trabajo y Procesamiento SIG / Teledetección</text>

  <text x="600" y="90" font-family="sans-serif" font-size="22" font-weight="bold" fill="#064e3b" text-anchor="middle">Laboratorio de Geomática UIS</text>
  <text x="600" y="115" font-family="sans-serif" font-size="13" fill="#047857" text-anchor="middle">Área de Sensores, Topografía y Procesamiento</text>
</svg>'''

with open('uploads/planos/lab_geomatica.svg', 'w', encoding='utf-8') as f:
    f.write(svg_geomatica)

# 4. Auditorio (1000 x 700)
svg_auditorio = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 700" width="1000" height="700">
  <defs>
    <pattern id="grid4" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e0d3" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1000" height="700" fill="#faf9f5"/>
  <rect width="1000" height="700" fill="url(#grid4)"/>
  <rect x="50" y="50" width="900" height="600" fill="none" stroke="#2d3748" stroke-width="12" rx="6"/>

  <rect x="150" y="80" width="700" height="140" rx="10" fill="#fed7aa" stroke="#c2410c" stroke-width="3"/>
  <text x="500" y="155" font-family="sans-serif" font-weight="bold" font-size="20" fill="#9a3412" text-anchor="middle">Escenario Principal</text>

  <rect x="220" y="110" width="60" height="50" fill="#7c2d12" rx="4"/>
  <text x="250" y="140" font-family="sans-serif" font-size="11" fill="#fff" text-anchor="middle">Atril</text>

  <line x1="380" y1="85" x2="620" y2="85" stroke="#1d4ed8" stroke-width="8"/>
  <text x="500" y="75" font-family="sans-serif" font-size="12" font-weight="bold" fill="#1d4ed8" text-anchor="middle">Pantalla Proyector</text>

  <circle cx="500" cy="350" r="20" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>
  <text x="500" y="390" font-family="sans-serif" font-size="12" font-weight="bold" fill="#334155" text-anchor="middle">Videobeam (Techo)</text>

  <rect x="180" y="420" width="640" height="180" fill="#f1f5f9" stroke="#94a3b8" stroke-dasharray="6,6" rx="6"/>
  <text x="500" y="515" font-family="sans-serif" font-size="18" font-weight="bold" fill="#64748b" text-anchor="middle">Silletería del Auditorio</text>

  <line x1="450" y1="650" x2="550" y2="650" stroke="#faf9f5" stroke-width="14"/>
  <text x="500" y="685" font-family="sans-serif" font-size="14" fill="#718096" text-anchor="middle">Entrada</text>
  <text x="500" y="35" font-family="sans-serif" font-size="20" font-weight="bold" fill="#1e293b" text-anchor="middle">Auditorio</text>
</svg>'''

with open('uploads/planos/auditorio.svg', 'w', encoding='utf-8') as f:
    f.write(svg_auditorio)

print("Planos generados correctamente.")

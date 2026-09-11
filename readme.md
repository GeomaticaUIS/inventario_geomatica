# Inventario de Equipos y Esquemas de Sala (Geomática UIS)

Sistema interno de gestión de inventario para equipos técnicos, de cómputo y sensores del Grupo de Geomática UIS. Funciona sobre **SQLite** y un servidor local en **Python (FastAPI)**, integrando almacenamiento local de imágenes y **esquemas interactivos 2D de salas (Indoor Mapping)** con Leaflet.

---

## 🚀 Características Principales

1. **Servidor Local Seguro (Sin exposición pública)**:
   - Funciona en la intranet o red local del laboratorio (`http://localhost:8000` o `http://<IP-LAN>:8000`).
   - No requiere GitHub Pages ni tokens de GitHub en el navegador.
2. **Base de Datos SQLite (`data/inventario.db`)**:
   - Todo el inventario, usuarios y coordenadas espaciales residen en un solo archivo.
   - Respaldos ultra sencillos: basta con copiar el archivo `.db`.
   - Soporta alta concurrencia mediante modo WAL (*Write-Ahead Logging*).
3. **Esquemas 2D de Salas Interactivos (Indoor Mapping)**:
   - Visualización de planos de salas y laboratorios con **Leaflet (`L.CRS.Simple`)** 100% offline.
   - Cada equipo se ubica como un pin sobre el plano de su sala correspondiente (mesas, estantes, gabinetes).
   - En la vista pública: clic en un pin para ver ficha y foto del equipo; buscar en la tabla enfoca automáticamente el equipo en el plano.
   - En el panel de administración: clic directo sobre el plano para asignar o mover la ubicación del equipo.
4. **Gestión Local de Fotos**:
   - Carga y visualización directa de fotos almacenadas en disco (`uploads/fotos/`).
   - Modal para ampliación de imágenes en alta resolución.

---

## 📁 Estructura del Proyecto

```
inventario_geomatica/
├── run.bat                 # Ejecutable para Windows (doble clic para iniciar)
├── run.py                  # Script lanzador en Python
├── requirements.txt        # Dependencias (FastAPI, Uvicorn, Python-Multipart)
├── index.html              # Vista pública: Tabla responsiva + Esquema 2D de salas
├── admin.html              # Panel de gestión: Login, CRUD y selector en plano
├── css/
│   └── style.css           # Estilos responsivos y diseño UI
├── js/
│   ├── app.js              # Lógica de index.html (tabla, filtros y mapa Leaflet)
│   └── admin.js            # Lógica de admin.html (autenticación y fijación de pines)
├── backend/
│   ├── database.py         # Conexión SQLite, esquemas y migración de datos
│   └── app.py              # API REST en FastAPI y servidor de archivos estáticos
├── vendor/
│   └── leaflet/            # Biblioteca Leaflet y estilos (100% offline)
├── uploads/
│   ├── fotos/              # Fotografías de los equipos
│   └── planos/             # Planos esquemáticos SVG/PNG de las salas
└── data/
    └── inventario.db       # Base de datos SQLite
```

---

## ⚡ Cómo Iniciar el Sistema

### En Windows:
Haz doble clic en **`run.bat`** o ejecuta en la consola:
```powershell
python run.py
```

### En Linux / Mac:
```bash
python3 run.py
```

Abre tu navegador en:
* **Vista Pública:** `http://localhost:8000`
* **Panel de Administración:** `http://localhost:8000/admin.html`
* **Acceso desde otros equipos del laboratorio:** `http://<IP-DEL-SERVIDOR>:8000`

---

## 🔐 Usuarios y Credenciales Iniciales

El sistema migró automáticamente los usuarios existentes:

| Usuario | Contraseña Inicial | Rol |
| :--- | :--- | :--- |
| `rector` | `cambiar123` | Administrador |
| `jhon` | `cambiar123` | Editor |
| `yerly` | `cambiar123` | Editor |

---

## 🗺️ Salas Configuradas y Planos de Muestra

1. **Oficina Rectoría** (`oficina_rectoria`): Escritorio principal en L, mesa de juntas y archivadores.
2. **Sala de Sistemas** (`sala_sistemas`): Puesto docente, 4 islas de cómputo y rack de red.
3. **Laboratorio de Geomática UIS** (`lab_geomatica`): Gabinetes GNSS/Estaciones, mesas de calibración y estaciones SIG.
4. **Auditorio** (`auditorio`): Escenario, pantalla de proyección y silletería.

*Puedes subir tus propios planos en formato PNG, JPG o SVG reemplazando o añadiendo archivos en `uploads/planos/`.*

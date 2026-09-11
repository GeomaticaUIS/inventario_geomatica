Inventario de elementos (GitHub Pages)

Sitio estático para consultar y editar un inventario de elementos, con los datos guardados como JSON versionado en el propio repositorio, incluyendo fotos y acceso con usuario/contraseña al formulario de edición.

Estructura
inventario-git/
├── index.html              # Vista pública: tabla con búsqueda y filtros
├── admin.html               # Login + formulario para añadir/editar/eliminar ítems
├── generar-hash.html         # Utilidad para crear/cambiar contraseñas
├── css/style.css
├── js/app.js                 # Lógica de index.html
├── js/admin.js                # Lógica de admin.html (login, lectura/escritura vía API de GitHub)
├── data/items.json             # Los datos del inventario
├── data/credentials.json        # Usuarios y contraseñas (hash) para entrar a admin.html
└── fotos_inventario/
    ├── rector/
    ├── jhon/
    └── yerly/
1. Publicar en GitHub Pages
Crea un repositorio en GitHub y sube el contenido de esta carpeta.
Ve a Settings → Pages.
En "Build and deployment", elige Deploy from a branch, rama main, carpeta / (root).
En un par de minutos tu sitio estará en https://<tu-usuario>.github.io/<tu-repo>/.
2. Campos de cada ítem (data/items.json)
json
{
  "id": "1001",
  "descripcion": "Escritorio en L con superficie de madera",
  "ubicacion": "Oficina rectoría",
  "observacion": "Buen estado",
  "tipo_inventario": "Mayor",
  "funcionario": "rector",
  "imagen": "fotos_inventario/rector/1001.jpg"
}

tipo_inventario es uno de: Mayor, Menor, Intangible. funcionario corresponde a una de las subcarpetas de fotos_inventario/.

3. Usuarios y contraseñas de admin.html

data/credentials.json contiene los usuarios que pueden entrar al formulario de edición. Las contraseñas no se guardan en texto plano, se guarda un hash (SHA-256):

json
{ "usuario": "jhon", "hash": "…", "nombre": "Jhon" }

Los tres usuarios de ejemplo (rector, jhon, yerly) tienen todos la contraseña de ejemplo cambiar123 — cámbiala antes de usar el sitio:

Abre generar-hash.html en el navegador.
Escribe la nueva contraseña; te muestra el hash correspondiente.
Reemplaza ese hash en el usuario correspondiente dentro de data/credentials.json y súbelo al repo.
⚠️ Qué protege este login y qué no

Este login es una puerta de identificación, no un mecanismo de seguridad fuerte: data/credentials.json es un archivo público del repositorio, así que alguien con conocimientos técnicos podría leerlo e intentar adivinar la contraseña fuera de línea a partir del hash. Lo que realmente controla quién puede guardar cambios en el repositorio es el token de GitHub que se configura por separado en "Configuración de conexión con GitHub" dentro de admin.html — solo alguien con ese token puede hacer commits, sin importar si pasó el login. Trata el login como una forma de saber "quién edita cada ítem", y el token como el candado real. Si necesitas seguridad más estricta (por ejemplo, que cada funcionario no pueda editar los ítems de otro), lo correcto es moverse a una solución con backend real.

4. Editar desde el formulario (admin.html)
Inicia sesión con tu usuario y contraseña.
Despliega "Configuración de conexión con GitHub" (solo la primera vez, o si no marcaste "recordar"):
Settings de tu cuenta de GitHub → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
Limita el token solo a este repositorio, con permiso Contents: Read and write únicamente.
Pégalo en el campo "Token de GitHub".
Completa el formulario (número de inventario, descripción, ubicación, observación, tipo, funcionario y, opcionalmente, una foto) y guarda.
Cada guardado crea uno o dos commits: la foto (si la subiste, a fotos_inventario/<funcionario>/<numero>.<extensión>) y el registro en data/items.json.

El token se guarda solo en el navegador (sessionStorage, nunca se sube al repo). No compartas admin.html con un enlace público visible si no quieres que cualquiera con el token de alguien más pueda editar; para uso interno basta con no anunciar la URL fuera del equipo.

5. Cargar tu inventario real desde Excel

Exporta tu hoja de Excel como CSV, y cuando la tengas lista te ayudo a convertirla a este formato JSON (data/items.json) y a organizar las fotos en las carpetas correspondientes de fotos_inventario/.

# StorageEditor

Editor avanzado de cookies, Local Storage e IndexedDB para Chrome/Edge/Firefox (Manifest V3).

Gestiona los tres tipos de almacenamiento del navegador desde un solo popup, directamente sobre la pestaña activa.

## Funcionalidades

### Cookies
- Listar todas las cookies del contexto de navegación actual
- Crear, editar y eliminar cookies individualmente
- Editar nombre, valor, dominio, path, expiración, Secure, HttpOnly y SameSite
- Exportar a JSON (copiar al portapapeles o descargar)
- Importar desde JSON
- Limpiar todas las cookies con confirmación

### Local Storage
- Listar claves y valores del localStorage del sitio activo
- Editar, crear y eliminar elementos
- Exportar a JSON
- Importar con opciones de fusión o reemplazo
- Limpiar todo con confirmación

### IndexedDB
- Listar bases de datos, object stores y registros (vista jerárquica)
- Editar, añadir y eliminar registros
- Exportar base de datos completa o store individual
- Importar datos con creación automática de stores si no existen
- Eliminar base de datos completa con confirmación

## Capturas

![StorageEditor](https://raw.githubusercontent.com/anomalyco/storageeditor/main/screenshot.png)

## Instalación

1. Descarga o clona el repositorio
2. Abre `chrome://extensions` (Chrome/Edge) o `about:debugging#/runtime/this-firefox` (Firefox)
3. Activa el **Modo desarrollador**
4. Haz clic en **Cargar extensión sin empaquetar**
5. Selecciona la carpeta de la extensión

## Permisos

| Permiso | Motivo |
|---------|--------|
| `cookies` | Leer, crear, editar y eliminar cookies |
| `activeTab` | Acceder a la pestaña activa solo cuando se invoca la extensión |
| `scripting` | Inyectar scripts para acceder a localStorage e IndexedDB |
| `host_permissions` (`*://*/*`) | Necesario para que la API de cookies funcione correctamente |

La extensión **no recopila ningún dato**. Todo el código se ejecuta localmente en el navegador.

## Licencia

MIT

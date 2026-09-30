# Sistema de Aprobaciones — SeaTable + Next.js

Primera versión funcional para conectar una base de SeaTable con una aplicación web.

## Qué hace esta versión

- Detecta automáticamente las tablas de la base de SeaTable.
- Muestra cada tabla como una pestaña superior.
- Al hacer clic en una pestaña, consulta sus registros.
- Muestra las columnas y registros en una tabla horizontal.
- Paginación para no descargar toda la base de una vez.
- Filtros iniciales para Marca, Proyecto, Tipo de producto y Número de OPA cuando esas columnas existen.
- Búsqueda sobre los registros de la página actual.
- Botón para actualizar datos.
- El token de SeaTable queda únicamente en el servidor.
- Lista preparada para desplegar en Render.

## 1. Requisitos

- Node.js 20 o superior
- Una base de SeaTable
- Un Base Token/API Token con permisos de lectura

## 2. Ejecutar localmente

Copia `.env.example` a `.env.local` y completa:

```env
SEATABLE_SERVER=https://cloud.seatable.io
SEATABLE_BASE_UUID=TU_BASE_UUID
SEATABLE_TOKEN=TU_TOKEN
TABLE_PAGE_SIZE=50
```

Luego:

```bash
npm install
npm run dev
```

Abre:

http://localhost:3000

## 3. Subir a GitHub

```bash
git init
git add .
git commit -m "Primera versión sistema aprobaciones"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/sistema-aprobaciones.git
git push -u origin main
```

## 4. Publicar en Render

En Render:

1. New + → Web Service.
2. Conecta GitHub.
3. Selecciona `sistema-aprobaciones`.
4. Runtime: Node.
5. Build Command:

```bash
npm install && npm run build
```

6. Start Command:

```bash
npm start
```

7. Selecciona el plan Free para comenzar.
8. En Environment agrega:
   - `SEATABLE_SERVER`
   - `SEATABLE_BASE_UUID`
   - `SEATABLE_TOKEN`
   - `TABLE_PAGE_SIZE`

No subas `.env.local` a GitHub.

## Importante sobre las pestañas

La aplicación no necesita que escribamos manualmente "BLUEY", "CABALLERO DEL ZODIACO", etc.

Consulta la información de la base de SeaTable y crea las pestañas automáticamente con los nombres de las tablas.

Por eso, si mañana agregas otra tabla en SeaTable, la aplicación podrá detectarla sin cambiar el código.

## Próxima fase

Esta versión es la base técnica. Después podemos agregar:

- Login y usuarios.
- Roles y permisos.
- Crear/editar/eliminar registros.
- Flujo de aprobación.
- Historial y auditoría.
- Dashboard con KPIs como el de tu diseño.
- Matriz Proyecto × Etapa.
- Filtros globales.
- Exportación a Excel/CSV.
- Vista detallada de cada OPA.
- Adjuntos.
- Comentarios.
- Notificaciones.
- Mejoras de rendimiento para miles de registros.

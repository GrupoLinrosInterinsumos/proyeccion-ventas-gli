# Proyección de Ventas · GLI

Sistema interno para proyectar las ventas del mes por vendedor, a partir del reporte mensual de
Odoo (`REPORTE SIN COSTOS -[MES] [AÑO].xlsx`).

## Cómo funciona

- **Login por usuario**: cada vendedor tiene su propia cuenta y solo ve y edita **su propia**
  proyección — incluida la cuenta administradora, que también es vendedora y está sujeta a la
  misma regla.
- **Mi proyección** (`/ventas`): tabla de los productos de ese vendedor, ordenada de mayor a menor
  según el **promedio de venta mensual de los 3 últimos meses cerrados** (si hoy es 24 de agosto,
  promedia mayo, junio y julio). Al hacer clic en un producto se despliega a qué clientes
  (Partner) le vendió ese producto en esos 3 meses. **Proyección** y **Observaciones** son celdas
  editables que se guardan automáticamente. "+ Agregar producto" suma uno sin historial.
- **Dashboard** (`/dashboard`, solo administradores): resumen general con **filtros por región y
  por vendedor**. Sin filtro se ve el desglose por región; al elegir una región se ve el desglose
  por vendedor de esa región; al elegir un vendedor se ve su tabla completa en modo solo lectura
  (el administrador puede *ver* la proyección de cualquiera, pero no editarla).
- **Importar data** (`/importar`, solo administradores): subir el Excel reemplaza automáticamente
  los meses que trae el archivo (el reporte de Odoo es acumulado año a la fecha) y recalcula todo.

## Primeros pasos (desarrollo local)

```bash
npm install
npm run seed   # importa el Excel inicial y crea un usuario por cada vendedor
npm run dev
```

Abre `http://localhost:3000`. No necesitas instalar Postgres: en desarrollo la app usa una base
Postgres embebida (`@electric-sql/pglite`) guardada en `./data`. En producción usa Postgres real
vía `DATABASE_URL` (ver despliegue abajo) — el esquema de tablas se crea solo en el primer uso.

### Usuarios generados por el seed (contraseña: `Ventas2026`)

`npm run seed` crea una cuenta por cada nombre distinto en la columna "Vendedor" del Excel
(correo autogenerado tipo `nombre.apellido@gli.pe`), y marca como **administradora** a la cuenta
cuyo vendedor coincide con `GABRIELA GONZALEZ` (constante `ADMIN_VENDEDOR` en
`scripts/seed.ts`, con correo fijo `g.gonzalez@gli.pe`). Revisa la salida del comando para ver
los correos exactos generados y corrígelos por los reales antes de repartir accesos. Volver a
correr `npm run seed` es seguro: no pisa usuarios que ya existen.

## Despliegue en Render

El proyecto incluye `render.yaml` (Blueprint) con dos recursos: el servicio web y una base
Postgres.

1. Sube este repositorio a GitHub (sin la carpeta `data/`, ya excluida en `.gitignore`).
2. En Render: **New → Blueprint**, apunta al repo. Render crea la base de datos y el servicio web,
   y conecta `DATABASE_URL` automáticamente.
3. Al primer request, la app crea las tablas solas. Para cargar los usuarios y la data inicial,
   corre el seed **una vez** desde tu máquina apuntando a la base de Render:
   ```bash
   DATABASE_URL="<External Database URL de Render>" npm run seed "C:/ruta/al/REPORTE ....xlsx"
   ```
   (o entra a la Shell del servicio en Render y corre `npm run seed` si el archivo ya está ahí).
4. Los meses siguientes se cargan desde `/importar` en la propia app — no hace falta volver a
   tocar la base manualmente.

Nota: el plan **free** de Postgres en Render expira a los 30 días y el servicio web free se
"duerme" con inactividad. Para uso real de la empresa conviene el plan **Starter** en ambos
recursos.

## Notas técnicas

- **Stack**: Next.js (App Router) + TypeScript + Tailwind. Postgres como única fuente de datos,
  vía `pg` en producción (`DATABASE_URL`) y `@electric-sql/pglite` (Postgres embebido, mismo SQL)
  en desarrollo local — `lib/db.ts` decide cuál usar.
- **Colores y tipografía**: tomados de `DESIGN (3).md` (indigo `#1d226e` como primario, carmesí
  `#bb001e` reservado para alertas/variaciones negativas, tipografía Inter).
- **Logo**: los archivos en `public/logo-gli-*.png` son la marca real de GLI (no un ícono
  genérico), recortados y con una variante en blanco para el panel indigo de `/login`.
- **Importación**: `lib/import-excel.ts` lee la hoja `DATA` del Excel, agrega por
  (mes, región, vendedor, producto, cliente) y reemplaza esos meses en la tabla `sales`
  (`lib/import-commit.ts`), dejando un registro en `imports` para auditoría.
- **Alcance de edición**: `proyeccion`/`observaciones` se guardan por (mes, vendedor, producto) —
  sin región — así que cada usuario, sea o no administrador, solo puede escribir en filas donde
  `vendedor` coincide con su propia cuenta (validado en `app/actions.ts`).
- **Sesión**: cookie firmada (JWT/HS256) de 30 días; define `SESSION_SECRET` en producción (Render
  lo genera solo si usas el Blueprint).

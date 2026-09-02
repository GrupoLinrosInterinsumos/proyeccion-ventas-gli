"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import { createSessionCookie, clearSessionCookie, getSession, findUserByEmail } from "@/lib/auth";
import { parseSalesWorkbook } from "@/lib/import-excel";
import { commitImport } from "@/lib/import-commit";
import { openProjectionPeriod, periodStatus } from "@/lib/period";
import { isRegion } from "@/lib/regions";
import { generatePassword } from "@/lib/password";
import { countAdmins } from "@/lib/users";
import { saveClientProjection } from "@/lib/client-projections";

export type ActionState = { error?: string; success?: string } | null;

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Ingresa correo y contraseña." };

  const user = await findUserByEmail(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return { error: "Credenciales incorrectas." };
  }

  await createSessionCookie(user);
  redirect("/");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

const projectionSchema = z.object({
  vendedor: z.string().min(1),
  producto_ref: z.string().min(1),
  producto_nombre: z.string().min(1),
  period: z.string().min(1),
  proyeccion: z.string().optional(),
  observaciones: z.string().optional(),
});

export async function saveProjectionAction(formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sesión expirada." };

  const parsed = projectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Datos inválidos." };
  const data = parsed.data;

  if (data.vendedor !== session.vendedor) {
    return { error: "Solo puedes editar tu propia proyección." };
  }
  if (periodStatus(data.period) !== "open") {
    return { error: "Esta proyección ya está cerrada y no se puede editar." };
  }

  const proyeccionNum =
    data.proyeccion && data.proyeccion.trim() !== "" ? Number(data.proyeccion) : null;
  if (proyeccionNum !== null && Number.isNaN(proyeccionNum)) {
    return { error: "La proyección debe ser numérica." };
  }

  await query(
    `INSERT INTO projections (period, vendedor, producto_ref, producto_nombre, proyeccion, observaciones, is_manual, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,now())
     ON CONFLICT (period, vendedor, producto_ref) DO UPDATE SET
       proyeccion = excluded.proyeccion,
       observaciones = excluded.observaciones,
       producto_nombre = excluded.producto_nombre,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [
      data.period,
      data.vendedor,
      data.producto_ref,
      data.producto_nombre,
      proyeccionNum,
      data.observaciones?.trim() || null,
      session.id,
    ]
  );

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  return { success: "Guardado." };
}

const addProductSchema = z.object({
  vendedor: z.string().min(1),
  producto_nombre: z.string().min(2, "Escribe un nombre de producto."),
  proyeccion: z.string().optional(),
  observaciones: z.string().optional(),
});

export async function addProductAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sesión expirada." };

  const parsed = addProductSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const data = parsed.data;

  if (data.vendedor !== session.vendedor) {
    return { error: "Solo puedes agregar productos a tu propia proyección." };
  }

  const period = openProjectionPeriod();
  const slug = data.producto_nombre
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const producto_ref = `MANUAL-${data.vendedor.replace(/\s+/g, "").slice(0, 6).toUpperCase()}-${slug.slice(0, 24)}`;

  const proyeccionNum =
    data.proyeccion && data.proyeccion.trim() !== "" ? Number(data.proyeccion) : null;
  if (proyeccionNum !== null && Number.isNaN(proyeccionNum)) {
    return { error: "La proyección debe ser numérica." };
  }

  await query(
    `INSERT INTO projections (period, vendedor, producto_ref, producto_nombre, proyeccion, observaciones, is_manual, updated_by, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,now())
     ON CONFLICT (period, vendedor, producto_ref) DO UPDATE SET
       proyeccion = excluded.proyeccion,
       observaciones = excluded.observaciones,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [
      period,
      data.vendedor,
      producto_ref,
      data.producto_nombre.trim(),
      proyeccionNum,
      data.observaciones?.trim() || null,
      session.id,
    ]
  );

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  return { success: "Producto agregado." };
}

export async function uploadImportAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session || !session.isAdmin) return { error: "No autorizado para subir data." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo .xlsx." };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSalesWorkbook(buffer);
    await commitImport(parsed, file.name, session.id);
    revalidatePath("/ventas");
    revalidatePath("/dashboard");
    revalidatePath("/importar");
    const periodsMsg = `Periodos actualizados: ${parsed.periods.join(", ")}.`;
    const warnMsg = parsed.warnings.length ? ` (${parsed.warnings.join(" ")})` : "";
    return {
      success: `Importado correctamente: ${parsed.rows.length} registros agregados. ${periodsMsg}${warnMsg}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Error al procesar el archivo." };
  }
}

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Escribe un nombre."),
  email: z.string().trim().toLowerCase().email("Correo inválido."),
  vendedor: z.string().trim().optional(),
  region: z.string().optional(),
  password: z.string().optional(),
  is_admin: z.string().optional(),
  is_spot: z.string().optional(),
});

function uniqueViolationField(err: unknown): "email" | "vendedor" | null {
  const detail = (err as { detail?: string; constraint?: string } | null)?.detail ?? "";
  const constraint = (err as { constraint?: string } | null)?.constraint ?? "";
  if (/email/i.test(detail) || /email/i.test(constraint)) return "email";
  if (/vendedor/i.test(detail) || /vendedor/i.test(constraint)) return "vendedor";
  return null;
}

/** vendedor is optional only for a pure "admin viewer" account; region follows vendedor. */
function resolveVendedorFields(data: {
  vendedor?: string;
  region?: string;
  is_admin?: string;
  is_spot?: string;
}): { error: string } | { vendedor: string | null; region: string | null; isAdmin: boolean; isSpot: boolean } {
  const isAdmin = data.is_admin === "on";
  const isSpot = data.is_spot === "on";
  const vendedor = data.vendedor?.trim() || null;
  const region = data.region && isRegion(data.region) ? data.region : null;

  if (isSpot && !vendedor) return { error: "Venta Spot necesita un nombre (aunque no tenga historial)." };
  if (!vendedor && !isAdmin) {
    return { error: "El vendedor es obligatorio (solo un administrador puede quedar sin vendedor)." };
  }
  if (vendedor && !region) return { error: "Selecciona una región." };

  return { vendedor, region, isAdmin, isSpot };
}

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session || !session.isAdmin) return { error: "No autorizado." };

  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const data = parsed.data;

  const resolved = resolveVendedorFields(data);
  if ("error" in resolved) return resolved;

  const password = data.password?.trim() || generatePassword();
  if (password.length < 6) return { error: "La contraseña debe tener al menos 6 caracteres." };

  try {
    await query(
      `INSERT INTO users (name, email, password_hash, vendedor, region, is_admin, is_spot)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        data.name,
        data.email,
        bcrypt.hashSync(password, 10),
        resolved.vendedor,
        resolved.region,
        resolved.isAdmin,
        resolved.isSpot,
      ]
    );
  } catch (err) {
    const field = uniqueViolationField(err);
    if (field === "email") return { error: `El correo ${data.email} ya está en uso.` };
    if (field === "vendedor") return { error: `Ya existe una cuenta para el vendedor "${resolved.vendedor}".` };
    return { error: err instanceof Error ? err.message : "No se pudo crear el usuario." };
  }

  revalidatePath("/usuarios");
  return {
    success: `Usuario creado. Correo: ${data.email} · Contraseña: ${password} (guárdala, no se muestra de nuevo).`,
  };
}

export async function deleteUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session || !session.isAdmin) return { error: "No autorizado." };

  const id = Number(formData.get("id"));
  if (!id) return { error: "Usuario inválido." };
  if (id === session.id) return { error: "No puedes eliminar tu propia cuenta." };

  const target = await query<{ is_admin: boolean; name: string }>(
    `SELECT is_admin, name FROM users WHERE id = $1`,
    [id]
  );
  if (target.length === 0) return { error: "Ese usuario ya no existe." };

  if (target[0].is_admin && (await countAdmins()) <= 1) {
    return { error: "No puedes eliminar al único administrador." };
  }

  await query(`DELETE FROM users WHERE id = $1`, [id]);
  revalidatePath("/usuarios");
  return { success: `${target[0].name} fue eliminado.` };
}

const editUserSchema = z.object({
  id: z.string().regex(/^\d+$/, "Usuario inválido."),
  name: z.string().trim().min(2, "Escribe un nombre."),
  email: z.string().trim().toLowerCase().email("Correo inválido."),
  vendedor: z.string().trim().optional(),
  region: z.string().optional(),
  password: z.string().optional(),
  is_admin: z.string().optional(),
  is_spot: z.string().optional(),
});

export async function editUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session || !session.isAdmin) return { error: "No autorizado." };

  const parsed = editUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const data = parsed.data;
  const id = Number(data.id);

  const resolved = resolveVendedorFields(data);
  if ("error" in resolved) return resolved;

  const current = await query<{ is_admin: boolean }>(`SELECT is_admin FROM users WHERE id = $1`, [id]);
  if (current.length === 0) return { error: "Ese usuario ya no existe." };

  if (current[0].is_admin && !resolved.isAdmin && (await countAdmins()) <= 1) {
    return { error: "No puedes quitarle el rol de administrador al único que queda." };
  }

  const password = data.password?.trim();
  if (password && password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  try {
    if (password) {
      await query(
        `UPDATE users SET name=$1, email=$2, vendedor=$3, region=$4, is_admin=$5, is_spot=$6, password_hash=$7 WHERE id=$8`,
        [data.name, data.email, resolved.vendedor, resolved.region, resolved.isAdmin, resolved.isSpot, bcrypt.hashSync(password, 10), id]
      );
    } else {
      await query(
        `UPDATE users SET name=$1, email=$2, vendedor=$3, region=$4, is_admin=$5, is_spot=$6 WHERE id=$7`,
        [data.name, data.email, resolved.vendedor, resolved.region, resolved.isAdmin, resolved.isSpot, id]
      );
    }
  } catch (err) {
    const field = uniqueViolationField(err);
    if (field === "email") return { error: `El correo ${data.email} ya está en uso.` };
    if (field === "vendedor") return { error: `Ya existe otra cuenta para el vendedor "${resolved.vendedor}".` };
    return { error: err instanceof Error ? err.message : "No se pudo actualizar el usuario." };
  }

  // If the admin edited their own account, refresh the session cookie so name/role/etc. stay in sync.
  if (id === session.id) {
    const updated = await findUserByEmail(data.email);
    if (updated) await createSessionCookie(updated);
  }

  revalidatePath("/usuarios");
  return { success: password ? "Usuario actualizado y contraseña cambiada." : "Usuario actualizado." };
}

const clientProjectionSchema = z.object({
  period: z.string().min(1),
  vendedor: z.string().min(1),
  producto_ref: z.string().min(1),
  producto_nombre: z.string().min(1),
  partner: z.string().trim().min(1, "Escribe el nombre del cliente."),
  proyeccion: z.string().optional(),
  precio: z.string().optional(),
  fijado_hasta: z.string().optional(),
});

export async function saveClientProjectionAction(formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sesión expirada." };

  const parsed = clientProjectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const data = parsed.data;

  const isOwnRow = data.vendedor === session.vendedor;
  if (!isOwnRow && !session.isAdmin) {
    return { error: "Solo puedes editar tu propia proyección." };
  }
  if (isOwnRow && periodStatus(data.period) !== "open") {
    return { error: "Esta proyección ya está cerrada y no se puede editar." };
  }

  const proyeccionNum = data.proyeccion?.trim() ? Number(data.proyeccion) : null;
  if (proyeccionNum !== null && Number.isNaN(proyeccionNum)) return { error: "La proyección debe ser numérica." };
  const precioNum = data.precio?.trim() ? Number(data.precio) : null;
  if (precioNum !== null && Number.isNaN(precioNum)) return { error: "El precio debe ser numérico." };
  const fijadoHasta = data.fijado_hasta?.trim() || null;

  await saveClientProjection({
    period: data.period,
    vendedor: data.vendedor,
    producto_ref: data.producto_ref,
    producto_nombre: data.producto_nombre,
    partner: data.partner.trim(),
    proyeccion: proyeccionNum,
    precio: precioNum,
    fijado_hasta: fijadoHasta,
    // Editing re-arms the over-threshold alert — only the explicit "descartar" dismisses it.
    alertAcknowledged: false,
    updatedBy: session.id,
  });

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  return { success: "Guardado." };
}

const acknowledgeAlertSchema = z.object({
  period: z.string().min(1),
  vendedor: z.string().min(1),
  producto_ref: z.string().min(1),
  producto_nombre: z.string().min(1),
  partner: z.string().min(1),
  proyeccion: z.string().optional(),
  precio: z.string().optional(),
  fijado_hasta: z.string().optional(),
});

export async function acknowledgeAlertAction(formData: FormData): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: "Sesión expirada." };

  const parsed = acknowledgeAlertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Datos inválidos." };
  const data = parsed.data;

  if (data.vendedor !== session.vendedor && !session.isAdmin) {
    return { error: "No autorizado." };
  }

  await saveClientProjection({
    period: data.period,
    vendedor: data.vendedor,
    producto_ref: data.producto_ref,
    producto_nombre: data.producto_nombre,
    partner: data.partner,
    proyeccion: data.proyeccion?.trim() ? Number(data.proyeccion) : null,
    precio: data.precio?.trim() ? Number(data.precio) : null,
    fijado_hasta: data.fijado_hasta?.trim() || null,
    alertAcknowledged: true,
    updatedBy: session.id,
  });

  revalidatePath("/ventas");
  revalidatePath("/dashboard");
  return { success: "Alerta descartada." };
}

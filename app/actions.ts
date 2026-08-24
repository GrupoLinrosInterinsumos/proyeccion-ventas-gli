"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "@/lib/db";
import { createSessionCookie, clearSessionCookie, getSession, findUserByEmail } from "@/lib/auth";
import { parseSalesWorkbook } from "@/lib/import-excel";
import { commitImport } from "@/lib/import-commit";
import { currentProjectionPeriod } from "@/lib/period";

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

  const period = currentProjectionPeriod();
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

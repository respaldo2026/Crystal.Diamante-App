import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/tesoreria/limpiar-duplicados
 *
 * Elimina registros duplicados en movimientos_financieros.
 * Duplicados de egresos: misma (referencia, tipo='egreso') → mantiene el más antiguo.
 * Duplicados de ingresos: mismo pago_id con pago_abono_id null → mantiene el más antiguo.
 * Duplicados de abonos: mismo pago_abono_id → mantiene el más antiguo.
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ success: false, error: "Faltan llaves de Supabase" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let totalEliminados = 0;

    // ── 1. Duplicados de egresos por referencia ──────────────────────────────
    const { data: egresos } = await supabase
      .from("movimientos_financieros")
      .select("id, referencia, created_at")
      .eq("tipo", "egreso")
      .not("referencia", "is", null)
      .order("created_at", { ascending: true });

    if (egresos && egresos.length > 0) {
      const vistos = new Map<string, string>(); // referencia → id_mas_antiguo
      const idsEliminar: string[] = [];

      for (const row of egresos) {
        const key = String(row.referencia);
        if (!vistos.has(key)) {
          vistos.set(key, row.id);
        } else {
          idsEliminar.push(row.id);
        }
      }

      if (idsEliminar.length > 0) {
        const { error } = await supabase
          .from("movimientos_financieros")
          .delete()
          .in("id", idsEliminar);
        if (error) throw error;
        totalEliminados += idsEliminar.length;
      }
    }

    // ── 2. Duplicados de ingresos por pago_id (sin abono) ────────────────────
    const { data: ingresos } = await supabase
      .from("movimientos_financieros")
      .select("id, pago_id, created_at")
      .eq("tipo", "ingreso")
      .not("pago_id", "is", null)
      .is("pago_abono_id", null)
      .order("created_at", { ascending: true });

    if (ingresos && ingresos.length > 0) {
      const vistos = new Map<string, string>();
      const idsEliminar: string[] = [];

      for (const row of ingresos) {
        const key = String(row.pago_id);
        if (!vistos.has(key)) {
          vistos.set(key, row.id);
        } else {
          idsEliminar.push(row.id);
        }
      }

      if (idsEliminar.length > 0) {
        const { error } = await supabase
          .from("movimientos_financieros")
          .delete()
          .in("id", idsEliminar);
        if (error) throw error;
        totalEliminados += idsEliminar.length;
      }
    }

    // ── 3. Duplicados de abonos por pago_abono_id ────────────────────────────
    const { data: abonos } = await supabase
      .from("movimientos_financieros")
      .select("id, pago_abono_id, created_at")
      .eq("tipo", "ingreso")
      .not("pago_abono_id", "is", null)
      .order("created_at", { ascending: true });

    if (abonos && abonos.length > 0) {
      const vistos = new Map<string, string>();
      const idsEliminar: string[] = [];

      for (const row of abonos) {
        const key = String(row.pago_abono_id);
        if (!vistos.has(key)) {
          vistos.set(key, row.id);
        } else {
          idsEliminar.push(row.id);
        }
      }

      if (idsEliminar.length > 0) {
        const { error } = await supabase
          .from("movimientos_financieros")
          .delete()
          .in("id", idsEliminar);
        if (error) throw error;
        totalEliminados += idsEliminar.length;
      }
    }

    // ── 4. Egresos viejos de pagos_nomina (categoría 'nomina_profesoras') ────
    // Ahora los egresos de profesoras se generan desde sesiones_clase
    // (referencia = 'sesion_clase_XXX'). Los antiguos no tienen ese prefijo.
    const { data: egresosViejosNomina } = await supabase
      .from("movimientos_financieros")
      .select("id, referencia")
      .eq("tipo", "egreso")
      .eq("categoria", "nomina_profesoras");

    if (egresosViejosNomina && egresosViejosNomina.length > 0) {
      const idsViejos = egresosViejosNomina
        .filter((r) => !String(r.referencia || "").startsWith("sesion_clase_"))
        .map((r) => r.id);
      if (idsViejos.length > 0) {
        const { error } = await supabase
          .from("movimientos_financieros")
          .delete()
          .in("id", idsViejos);
        if (error) throw error;
        totalEliminados += idsViejos.length;
      }
    }

    return NextResponse.json({ success: true, eliminados: totalEliminados });
  } catch (error: any) {
    console.error("Error limpiando duplicados:", error);
    return NextResponse.json({ success: false, error: error?.message || "Error desconocido" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const { movimientoId } = await request.json();

    if (!movimientoId) {
      return NextResponse.json({ success: false, error: "movimientoId es requerido" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ success: false, error: "Faltan llaves de Supabase" }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: movimiento, error: movError } = await supabaseAdmin
      .from("movimientos_financieros")
      .select("id, referencia, pago_id, pago_abono_id")
      .eq("id", movimientoId)
      .maybeSingle();

    if (movError) throw movError;
    if (!movimiento?.id) {
      return NextResponse.json({ success: false, error: "No se encontro el movimiento" }, { status: 404 });
    }

    const referencia = String(movimiento.referencia || "");

    // 1) Si el movimiento esta ligado a un abono, eliminar el abono fuente.
    if (movimiento.pago_abono_id) {
      const pagoAbonoId = String(movimiento.pago_abono_id);

      const { data: abono, error: abonoReadError } = await supabaseAdmin
        .from("pagos_abonos")
        .select("id, pago_id")
        .eq("id", pagoAbonoId)
        .maybeSingle();

      if (abonoReadError) throw abonoReadError;

      const { error: delAbonoError } = await supabaseAdmin
        .from("pagos_abonos")
        .delete()
        .eq("id", pagoAbonoId);

      if (delAbonoError) throw delAbonoError;

      const pagoId = String(abono?.pago_id || "");
      if (pagoId) {
        const { data: remanentes, error: remError } = await supabaseAdmin
          .from("pagos_abonos")
          .select("id")
          .eq("pago_id", pagoId)
          .limit(1);

        if (remError) throw remError;

        // Si no quedan abonos, devolver el pago a pendiente para evitar re-contabilizarlo.
        if (!remanentes || remanentes.length === 0) {
          const { error: updPagoError } = await supabaseAdmin
            .from("pagos")
            .update({ estado: "pendiente", fecha_pago: null, ticket_url: null })
            .eq("id", pagoId);

          if (updPagoError) throw updPagoError;
        }
      }

      // Eliminar cualquier movimiento asociado al mismo abono.
      const { error: delMovAbonoError } = await supabaseAdmin
        .from("movimientos_financieros")
        .delete()
        .eq("pago_abono_id", pagoAbonoId);

      if (delMovAbonoError) throw delMovAbonoError;

      return NextResponse.json({ success: true, cascaded: true, source: "pago_abono" });
    }

    // 2) Si el movimiento esta ligado a un pago completo, devolver ese pago a pendiente.
    if (movimiento.pago_id) {
      const pagoId = String(movimiento.pago_id);

      const { error: updPagoError } = await supabaseAdmin
        .from("pagos")
        .update({ estado: "pendiente", fecha_pago: null, ticket_url: null })
        .eq("id", pagoId);

      if (updPagoError) throw updPagoError;

      const { error: delMovPagoError } = await supabaseAdmin
        .from("movimientos_financieros")
        .delete()
        .eq("pago_id", pagoId)
        .is("pago_abono_id", null);

      if (delMovPagoError) throw delMovPagoError;

      return NextResponse.json({ success: true, cascaded: true, source: "pago" });
    }

    // 3) Si el movimiento viene de una sesion, marcarla como pendiente y borrar movimientos por referencia.
    if (referencia.startsWith("sesion_clase_")) {
      const sesionId = referencia.replace("sesion_clase_", "");

      if (sesionId) {
        const { error: updSesionError } = await supabaseAdmin
          .from("sesiones_clase")
          .update({ estado_pago: "pendiente" })
          .eq("id", sesionId);

        if (updSesionError) throw updSesionError;
      }

      const { error: delMovSesionError } = await supabaseAdmin
        .from("movimientos_financieros")
        .delete()
        .eq("referencia", referencia);

      if (delMovSesionError) throw delMovSesionError;

      return NextResponse.json({ success: true, cascaded: true, source: "sesion_clase" });
    }

    // 4) Movimiento manual/no ligado: borrar solo ese registro.
    const { error } = await supabaseAdmin
      .from("movimientos_financieros")
      .delete()
      .eq("id", movimientoId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("🔴 Error borrando movimiento:", error);
    return NextResponse.json({ success: false, error: error?.message || "Error desconocido" }, { status: 500 });
  }
}

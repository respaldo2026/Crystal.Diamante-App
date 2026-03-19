import { NextRequest, NextResponse } from "next/server";
import { insertWithAdmin, updateWithAdmin, supabaseAdmin } from "@/utils/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("[API asistencias/create] Datos recibidos:", body);

    // Validación básica
    if (!body.matricula_id || !body.fecha) {
      return NextResponse.json(
        { error: "matricula_id y fecha son requeridos" },
        { status: 400 }
      );
    }

    // Separar campos que NO pertenecen a la tabla asistencias
    const { auto_crear_pago: _acp, tema, ...asistenciaData } = body;

    // Insertar asistencia usando service role (bypasea RLS)
    const { data, error } = await insertWithAdmin("asistencias", asistenciaData);

    if (error) {
      console.error("[API asistencias/create] Error Supabase:", error);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 }
      );
    }

    console.log("[API asistencias/create] ✅ Asistencia creada:", data.id);

    // ── Auto-crear pago por clase cuando el estudiante asiste ──────────────
    let pagoCreado: {
      id: string;
      monto: number;
      claseNumero: number;
      fechaVencimiento: string;
      periodo_pagado: string;
    } | null = null;

    if (data && body.estado === "presente") {
      try {
        const { data: matricula } = await supabaseAdmin
          .from("matriculas")
          .select("modalidad_pago, valor_por_clase, estudiante_id")
          .eq("id", body.matricula_id)
          .maybeSingle();

        if (matricula?.modalidad_pago === "POR_CLASE") {
          // Número de clase: total de pagos por_clase ya registrados para esta matrícula
          const { count: clasesCount } = await supabaseAdmin
            .from("pagos")
            .select("id", { count: "exact", head: true })
            .eq("matricula_id", body.matricula_id)
            .eq("tipo_cuota", "por_clase");

          const claseNumero = (clasesCount || 0) + 1;
          const montoPorClase = Number(matricula.valor_por_clase || 0) || 40000;

          // Fecha formateada DD/MM/YYYY y vencimiento +7 días
          const [yyyy, mm, dd] = String(body.fecha).split("-");
          const fechaFormateada = `${dd}/${mm}/${yyyy}`;
          const vencDate = new Date(`${body.fecha}T12:00:00Z`);
          vencDate.setUTCDate(vencDate.getUTCDate() + 7);
          const fechaVencimiento: string = vencDate.toISOString().split("T")[0] ?? "";

          const { data: pagoData, error: pagoError } = await supabaseAdmin
            .from("pagos")
            .insert({
              matricula_id: Number(body.matricula_id),
              estudiante_id: matricula.estudiante_id,
              tipo_cuota: "por_clase",
              numero_cuota: claseNumero,
              monto: montoPorClase,
              estado: "pendiente",
              fecha_vencimiento: fechaVencimiento,
              periodo_pagado: `Clase #${claseNumero} - ${fechaFormateada}`,
              observaciones: tema ? `Tema: ${tema}` : null,
            })
            .select("id")
            .single();

          if (!pagoError && pagoData) {
            // Vincular asistencia ↔ pago
            await supabaseAdmin
              .from("asistencias")
              .update({ pago_id: pagoData.id })
              .eq("id", data.id);

            pagoCreado = {
              id: pagoData.id,
              monto: montoPorClase,
              claseNumero,
              fechaVencimiento,
              periodo_pagado: `Clase #${claseNumero} - ${fechaFormateada}`,
            };
            console.log("[API asistencias] ✅ Pago por clase creado:", pagoData.id);
          } else if (pagoError) {
            console.warn("[API asistencias] Error creando pago por clase:", pagoError);
          }
        }
      } catch (pagoErr) {
        // No fallar el registro de asistencia si falla la creación del pago
        console.warn("[API asistencias] Excepción creando pago por clase:", pagoErr);
      }
    }

    return NextResponse.json({
      data: { ...data, pago_id: pagoCreado?.id ?? data.pago_id ?? null },
      pagoCreado,
    });
  } catch (err: any) {
    console.error("[API asistencias/create] Error general:", err);
    return NextResponse.json(
      { error: err.message || "Error al crear la asistencia" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;
    
    console.log("[API asistencias/update] Actualizando asistencia:", id);

    if (!id) {
      return NextResponse.json(
        { error: "id es requerido para actualizar" },
        { status: 400 }
      );
    }

    // Actualizar usando service role (bypasea RLS)
    const { data, error } = await updateWithAdmin("asistencias", updateData, { id });

    if (error) {
      console.error("[API asistencias/update] Error Supabase:", error);
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: 400 }
      );
    }

    console.log("[API asistencias/update] ✅ Asistencia actualizada:", id);
    return NextResponse.json({ data: data?.[0] });

  } catch (err: any) {
    console.error("[API asistencias/update] Error general:", err);
    return NextResponse.json(
      { error: err.message || "Error al actualizar la asistencia" },
      { status: 500 }
    );
  }
}

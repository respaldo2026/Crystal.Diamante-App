import { supabaseBrowserClient } from "@utils/supabase/client";
import type { MovimientoCategoria, MovimientoTipo } from "@constants/movimientos";
import { normalizeModalidadPago } from "@/types/payment-plans";

const getPeriodoPagoLegible = (pago: {
    periodo_pagado?: string | null;
    numero_cuota?: number | null;
    tipo_cuota?: string | null;
    matriculas?: { modalidad_pago?: string | null } | null;
}) => {
    const periodoActual = String(pago?.periodo_pagado || "").trim();
    const numeroCuota = Number(pago?.numero_cuota || 0);
    const tipoCuota = String(pago?.tipo_cuota || "").toLowerCase().trim();
    const modalidadPago = normalizeModalidadPago(pago?.matriculas?.modalidad_pago);
    const esRegistroHistoricoPorClase =
        modalidadPago !== "POR_CLASE" &&
        (tipoCuota === "por_clase" || /^clase\s*#?\s*\d+/i.test(periodoActual));

    if (numeroCuota === 0) {
        return periodoActual || "Inscripción";
    }

    if (modalidadPago === "POR_CLASE") {
        return `Clase #${numeroCuota}`;
    }

    if (esRegistroHistoricoPorClase) {
        return "Pago previo por clase";
    }

    return periodoActual || `Cuota ${numeroCuota}`.trim();
};

export interface MovimientoFinanciero {
    id: string;
    fecha: string;
    tipo: MovimientoTipo;
    monto: number;
    concepto: string;
    categoria?: MovimientoCategoria | string | null;
    metodo_pago?: string | null;
    referencia?: string | null;
    descripcion?: string | null;
    estudiante_id?: string | null;
    proveedor_id?: string | null;
    ticket_url?: string | null;
    pago_id?: string | null;
    pago_abono_id?: string | null;
    conciliado: boolean;
    conciliado_el?: string | null;
    conciliado_por?: string | null;
    created_at: string;
    created_by?: string | null;
    perfiles?: { nombre_completo?: string | null; telefono?: string | null } | null;
    proveedores?: { nombre_completo?: string | null } | null;
}

export type MovimientoFiltro = {
    fechaDesde?: string;
    fechaHasta?: string;
    tipo?: MovimientoTipo;
    categoria?: string;
    metodo?: string;
    conciliado?: boolean;
    texto?: string;
};

export async function listarMovimientos(filtros: MovimientoFiltro = {}, options?: { userId?: string | null; esAdmin?: boolean }) {
    const { userId, esAdmin } = options || {};

    const query = supabaseBrowserClient
        .from("movimientos_financieros")
        .select(`*, perfiles:perfiles!movimientos_financieros_estudiante_id_fkey(nombre_completo, telefono), proveedores:perfiles!movimientos_financieros_proveedor_id_fkey(nombre_completo)`)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });

    // Si no es admin, limitamos a los movimientos creados por el usuario para evitar bloqueos por RLS
    if (!esAdmin && userId) {
        query.eq("created_by", userId);
    }

    if (filtros.fechaDesde) {
        query.gte("fecha", filtros.fechaDesde);
    }
    if (filtros.fechaHasta) {
        query.lte("fecha", filtros.fechaHasta);
    }
    if (filtros.tipo) {
        query.eq("tipo", filtros.tipo);
    }
    if (filtros.categoria) {
        query.eq("categoria", filtros.categoria);
    }
    if (filtros.metodo) {
        query.eq("metodo_pago", filtros.metodo);
    }
    if (typeof filtros.conciliado === "boolean") {
        query.eq("conciliado", filtros.conciliado);
    }
    if (filtros.texto) {
        query.or(
            [
                `concepto.ilike.%${filtros.texto}%`,
                `categoria.ilike.%${filtros.texto}%`,
                `metodo_pago.ilike.%${filtros.texto}%`,
                `referencia.ilike.%${filtros.texto}%`,
            ].join(",")
        );
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as MovimientoFinanciero[];
}

export async function crearMovimiento(payload: {
    fecha: string;
    tipo: MovimientoTipo;
    monto: number;
    concepto: string;
    categoria?: string;
    metodo_pago?: string | null;
    referencia?: string | null;
    descripcion?: string | null;
    estudiante_id?: string | null;
    proveedor_id?: string | null;
    ticket_url?: string | null;
    pago_id?: string | null;
    pago_abono_id?: string | null;
    created_by?: string | null;
}) {
    const { data, error } = await supabaseBrowserClient
        .from("movimientos_financieros")
        .insert(payload)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data as MovimientoFinanciero;
}

export async function actualizarMovimiento(id: string, payload: Partial<Omit<MovimientoFinanciero, "id" | "created_at">>) {
    const { data, error } = await supabaseBrowserClient
        .from("movimientos_financieros")
        .update(payload)
        .eq("id", id)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data as MovimientoFinanciero;
}

export async function eliminarMovimiento(id: string) {
    const response = await fetch("/api/tesoreria/delete-movimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movimientoId: id }),
    });

    const result = await response.json();

    if (!response.ok || !result?.success) {
        throw new Error(result?.error || "No se pudo eliminar el movimiento. Verifica permisos o que el registro exista.");
    }

    return true;
}

export async function registrarIngresoDesdePago(payload: {
    fecha: string;
    monto: number;
    concepto: string;
    categoria?: string;
    metodo_pago?: string | null;
    referencia?: string | null;
    descripcion?: string | null;
    estudiante_id?: string | null;
    ticket_url?: string | null;
    pago_id?: string | null;
    pago_abono_id?: string | null;
    created_by?: string | null;
}) {
    const record = {
        ...payload,
        tipo: "ingreso" as MovimientoTipo,
    };

    if (payload.pago_abono_id) {
        const { data: existing, error: existingError } = await supabaseBrowserClient
            .from("movimientos_financieros")
            .select("id")
            .eq("pago_abono_id", payload.pago_abono_id)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing?.id) {
            return actualizarMovimiento(existing.id, record);
        }

        return crearMovimiento(record);
    }

    if (payload.pago_id) {
        const { data: existing, error: existingError } = await supabaseBrowserClient
            .from("movimientos_financieros")
            .select("id")
            .eq("pago_id", payload.pago_id)
            .is("pago_abono_id", null)
            .maybeSingle();

        if (existingError) throw existingError;

        if (existing?.id) {
            return actualizarMovimiento(existing.id, record);
        }

        return crearMovimiento(record);
    }

    return crearMovimiento(record);
}

export async function sincronizarIngresosDesdePagos(createdBy?: string | null) {
    const { data: pagosConAbonos, error: abonosError } = await supabaseBrowserClient
        .from("pagos_abonos")
        .select("pago_id");

    if (abonosError) throw abonosError;

    const pagosConAbonosSet = new Set((pagosConAbonos || []).map((row: any) => String(row?.pago_id || "")).filter(Boolean));

    const { data: pagosPagados, error: pagosError } = await supabaseBrowserClient
        .from("pagos")
        .select("id, fecha_pago, monto, metodo_pago, referencia, observaciones, estudiante_id, ticket_url, periodo_pagado, numero_cuota, tipo_cuota, matriculas!pagos_matricula_id_fkey(modalidad_pago, cursos(nombre))")
        .eq("estado", "pagado")
        .not("fecha_pago", "is", null);

    if (pagosError) throw pagosError;

    if (!pagosPagados || pagosPagados.length === 0) {
        return { totalPagos: 0, sincronizados: 0 };
    }

    const registros = (pagosPagados as any[])
        .filter((p) => !pagosConAbonosSet.has(String(p?.id || "")))
        .filter((p) => Number(p?.monto || 0) > 0)
        .map((p) => {
            const fecha = String(p.fecha_pago).slice(0, 10);
            const periodo = getPeriodoPagoLegible(p as any);
            const curso = p?.matriculas?.cursos?.nombre || "Curso";
            const textoPeriodo = String(periodo || "").toLowerCase();
            const esInscripcion = textoPeriodo.includes("inscrip") || textoPeriodo.includes("matric") || Number(p.numero_cuota) === 0;

            return {
                fecha,
                tipo: "ingreso" as MovimientoTipo,
                monto: Number(p.monto || 0),
                concepto: `${periodo || "Pago"} - ${curso}`,
                categoria: esInscripcion ? "inscripciones" : "matriculas",
                metodo_pago: p.metodo_pago || null,
                referencia: p.referencia || p.id,
                descripcion: p.observaciones || null,
                estudiante_id: p.estudiante_id || null,
                ticket_url: p.ticket_url || null,
                pago_id: p.id,
                created_by: createdBy || null,
            };
        });

    if (registros.length === 0) {
        return { totalPagos: pagosPagados.length, sincronizados: 0 };
    }

    for (const record of registros) {
        await registrarIngresoDesdePago(record);
    }

    return { totalPagos: pagosPagados.length, sincronizados: registros.length };
}

export async function sincronizarEgresosDesdePagosNomina(createdBy?: string | null) {
    const { data: nomina, error } = await supabaseBrowserClient
        .from("pagos_nomina")
        .select("id, fecha_pago, total_pagado, total_horas, profesor_id, perfiles(nombre_completo)")
        .not("fecha_pago", "is", null);

    if (error) throw error;
    if (!nomina || nomina.length === 0) return { total: 0, sincronizados: 0 };

    let sincronizados = 0;
    for (const pago of nomina as any[]) {
        const monto = Number(pago.total_pagado || 0);
        if (monto <= 0) continue;

        // Verificar si ya existe un movimiento ligado a este pago_nomina
        const { data: existing } = await supabaseBrowserClient
            .from("movimientos_financieros")
            .select("id")
            .eq("referencia", pago.id)
            .eq("tipo", "egreso")
            .maybeSingle();

        if (existing?.id) continue; // ya sincronizado

        const nombre = pago.perfiles?.nombre_completo || "Profesora";
        const horas = Number(pago.total_horas || 0);
        await supabaseBrowserClient.from("movimientos_financieros").insert({
            fecha: String(pago.fecha_pago).slice(0, 10),
            tipo: "egreso" as MovimientoTipo,
            monto,
            concepto: `Nómina - ${nombre}${horas > 0 ? ` (${horas}h)` : ""}`,
            categoria: "nomina_profesoras",
            referencia: pago.id,
            proveedor_id: pago.profesor_id || null,
            conciliado: false,
            created_by: createdBy || null,
        });
        sincronizados++;
    }

    return { total: nomina.length, sincronizados };
}

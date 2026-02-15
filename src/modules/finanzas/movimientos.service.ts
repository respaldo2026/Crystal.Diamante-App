import { supabaseBrowserClient } from "@utils/supabase/client";
import type { MovimientoCategoria, MovimientoTipo } from "@constants/movimientos";

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
    conciliado: boolean;
    conciliado_el?: string | null;
    conciliado_por?: string | null;
    created_at: string;
    created_by?: string | null;
    perfiles?: { nombre_completo?: string | null } | null;
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
        .select(`*, perfiles:perfiles!movimientos_financieros_estudiante_id_fkey(nombre_completo), proveedores:perfiles!movimientos_financieros_proveedor_id_fkey(nombre_completo)`)
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
    const { data, error } = await supabaseBrowserClient
        .from("movimientos_financieros")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();

    if (error) throw error;

    if (!data?.id) {
        throw new Error("No se pudo eliminar el movimiento. Verifica permisos o que el registro exista.");
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
    created_by?: string | null;
}) {
    const record = {
        ...payload,
        tipo: "ingreso" as MovimientoTipo,
    };

    if (payload.pago_id) {
        const { data, error } = await supabaseBrowserClient
            .from("movimientos_financieros")
            .upsert(record, { onConflict: "pago_id" })
            .select()
            .maybeSingle();

        if (error) throw error;
        return data as MovimientoFinanciero;
    }

    return crearMovimiento(record);
}

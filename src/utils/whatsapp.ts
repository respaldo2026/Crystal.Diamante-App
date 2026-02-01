// src/utils/whatsapp.ts

import { buildWhatsappFallbackMessage } from "@/constants/whatsappTemplates";
import { supabaseBrowserClient } from "./supabase/client";

const EMOJI = {
    sparkle: "★",
    pin: "•",
    book: "»",
    clock: "»",
    money: "$",
    people: "»",
    calendar: "»",
    check: "✓",
    rocket: "➤",
    chat: "»",
    sparkleSmall: "•",
};

const formatearMensajePersuasivo = (mensaje: string): string => {
    const cuerpo = (mensaje || "").trim();

    if (!cuerpo) {
        return "";
    }

    const lineas = cuerpo
        .split("\n")
        .map((linea) => linea.trim())
        .filter(Boolean)
        .map((linea) => {
            const lower = linea.toLowerCase();

            if (lower.startsWith("programa:")) {
                return `${EMOJI.book} *${linea.toUpperCase()}*`;
            }

            if (lower.startsWith("duración:") || lower.startsWith("duracion:")) {
                return `${EMOJI.clock} *${linea.toUpperCase()}*`;
            }

            if (lower.startsWith("mensualidad:") || lower.startsWith("inscripción:") || lower.startsWith("inscripcion:")) {
                return `${EMOJI.money} *${linea.toUpperCase()}*`;
            }

            if (lower.startsWith("clases:") || lower.startsWith("cupos:")) {
                return `${EMOJI.people} *${linea.toUpperCase()}*`;
            }

            if (lower.startsWith("inicio:") || lower.startsWith("fecha:") || lower.startsWith("horario:")) {
                return `${EMOJI.calendar} *${linea.toUpperCase()}*`;
            }

            if (lower.startsWith("te comparto") || lower.startsWith("hola") || lower.startsWith("soy del equipo")) {
                return `${EMOJI.sparkleSmall} ${linea}`;
            }

            if (lower.endsWith("?") || lower.includes("¿")) {
                return `${EMOJI.check} *${linea.toUpperCase()}*`;
            }

            return linea;
        });

    const header = `${EMOJI.sparkle} *ACADEMIA CRYSTAL* ${EMOJI.sparkle}`;
    const titulo = `${EMOJI.pin} *INFORMACIÓN IMPORTANTE*`;
    const separador = "====================";
    const cta = `${EMOJI.rocket} *¡RESERVA TU CUPO HOY!*`;
    const cierre = `${EMOJI.chat} *RESPONDE ESTE MENSAJE Y TE ASESORO*`;

    const queIncluye = [
        "",
        `${EMOJI.check} *QUE INCLUYE:*`,
        "• Certificado Fisico y Digital",
        "• Ceremonia de Grado",
        "• Camiseta Uniforme",
        "• Alquiler de Toga",
        "• Kit de Productos",
    ];

    return [
        header,
        titulo,
        separador,
        ...lineas,
        ...queIncluye,
        "",
        separador,
        cta,
        cierre,
    ].join("\n");
};

/**
 * Abre un chat de WhatsApp con el mensaje predefinido.
 * @param telefono Número de teléfono (string o number)
 * @param mensaje Texto a enviar
 */
export const enviarWhatsapp = (telefono: string | number, mensaje: string) => {
    if (!telefono) {
        return;
    }

    // Convertir a string y limpiar caracteres no numéricos
    let phoneStr = String(telefono).replace(/\D/g, '');

    // Forzar prefijo Colombia (+57) para todos los enlaces
    if (!phoneStr.startsWith('57')) {
        phoneStr = `57${phoneStr}`;
    }

    // Ya NO formateamos el mensaje con estrellas, enviamos tal cual viene (desde la plantilla)
    const url = `https://wa.me/${phoneStr}?text=${encodeURIComponent(mensaje)}`;
    
    // Abrir en nueva pestaña
    window.open(url, '_blank');
};

/**
 * Obtiene una plantilla de WhatsApp y reemplaza las variables
 * @param nombrePlantilla Nombre de la plantilla (ej: 'inscripcion_academica')
 * @param variables Objeto con las variables a reemplazar (ej: {nombre: 'Juan', curso: 'Barbería'})
 * @returns Mensaje con las variables reemplazadas o null si no existe la plantilla
 */
const aplicarVariables = (texto: string, variables: Record<string, string | number>): string => {
    return texto.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, llave: string) => {
        const valor = variables[llave];
        return valor === undefined || valor === null ? "" : String(valor);
    });
};

export const obtenerPlantillaWhatsapp = async (
    nombrePlantilla: string,
    variables: Record<string, string | number>
): Promise<string | null> => {
    try {
        // Buscar plantilla activa
        const { data, error } = await supabaseBrowserClient
            .from("plantillas_whatsapp")
            .select("plantilla, activa")
            .eq("nombre", nombrePlantilla)
            .eq("activa", true)
            .maybeSingle();

        if (error || !data) {
            return null;
        }

        // Reemplazar variables en la plantilla
        const mensaje = aplicarVariables(data.plantilla, variables);

        return mensaje.trim().length > 0 ? mensaje : null;
    } catch (error) {
        return null;
    }
};

/**
 * Envía un mensaje de WhatsApp usando una plantilla
 * @param telefono Número de teléfono
 * @param nombrePlantilla Nombre de la plantilla
 * @param variables Variables a reemplazar
 * @param mensajeFallback Mensaje alternativo si no se encuentra la plantilla
 */
export const enviarWhatsappConPlantilla = async (
    telefono: string | number,
    nombrePlantilla: string,
    variables: Record<string, string | number>,
    mensajeFallback?: string
) => {
    const mensaje = await obtenerPlantillaWhatsapp(nombrePlantilla, variables);
    const fallback = mensajeFallback ?? buildWhatsappFallbackMessage(nombrePlantilla, variables);

    if (mensaje) {
        enviarWhatsapp(telefono, mensaje);
        return;
    }

    if (fallback && fallback.trim().length > 0) {
        enviarWhatsapp(telefono, fallback);
        return;
    }

    if (process.env.NODE_ENV !== "production") {
        console.warn(
            `[whatsapp] No se encontró plantilla activa ni fallback para "${nombrePlantilla}". Variables:`,
            variables,
        );
    }
};


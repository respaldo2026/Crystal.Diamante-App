// src/utils/whatsapp.ts

import { supabaseBrowserClient } from "./supabase/client";

/**
 * Abre un chat de WhatsApp con el mensaje predefinido.
 * @param telefono Número de teléfono (string o number)
 * @param mensaje Texto a enviar
 */
export const enviarWhatsapp = (telefono: string | number, mensaje: string) => {
    if (!telefono) {
        alert("El usuario no tiene teléfono registrado.");
        return;
    }

    // Convertir a string y limpiar caracteres no numéricos
    let phoneStr = String(telefono).replace(/\D/g, '');

    // Validación básica para Colombia (si tiene 10 dígitos, agregamos 57)
    // Puedes ajustar esto según tu país
    if (phoneStr.length === 10 && !phoneStr.startsWith('57')) {
        phoneStr = '57' + phoneStr;
    }

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
            .single();

        if (error || !data) {
            console.warn(`Plantilla '${nombrePlantilla}' no encontrada o inactiva`);
            return null;
        }

        // Reemplazar variables en la plantilla
        let mensaje = data.plantilla;
        Object.keys(variables).forEach(key => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            mensaje = mensaje.replace(regex, String(variables[key]));
        });

        return mensaje;
    } catch (error) {
        console.error("Error obteniendo plantilla WhatsApp:", error);
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
    
    if (mensaje) {
        enviarWhatsapp(telefono, mensaje);
    } else if (mensajeFallback) {
        enviarWhatsapp(telefono, mensajeFallback);
    } else {
        console.error(`No se pudo enviar WhatsApp: plantilla '${nombrePlantilla}' no disponible`);
    }
};
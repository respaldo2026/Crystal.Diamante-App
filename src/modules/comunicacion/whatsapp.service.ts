// Servicio de comunicación: envío de mensajes WhatsApp
export function enviarWhatsapp(numero: string, mensaje: string) {
  // Implementación real puede usar API externa o window.open
  if (!numero) return;
  const url = `https://wa.me/${numero.replace(/[^\d]/g, "")}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank");
}

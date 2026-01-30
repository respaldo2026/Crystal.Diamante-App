// Servicio de comunicación: envío de mensajes WhatsApp
export function enviarWhatsapp(numero: string, mensaje: string) {
  // Implementación real puede usar API externa o window.open
  if (!numero) return;
  let phoneStr = String(numero).replace(/[^\d]/g, "");
  if (!phoneStr.startsWith("57")) {
    phoneStr = `57${phoneStr}`;
  }
  const url = `https://wa.me/${phoneStr}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank");
}

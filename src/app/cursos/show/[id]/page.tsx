import { redirect } from "next/navigation";

export default function CursoShowPage({ params }: { params: { id: string } }) {
  // Redirige a la página de edición existente para evitar 404.
  // Esto mantiene el comportamiento "Gestionar" funcionando hasta
  // que se implemente una vista de detalle dedicada.
  const { id } = params;
  redirect(`/cursos/edit/${id}`);
}

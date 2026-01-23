import { useState, useEffect } from "react";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useCurrentUser } from "@hooks/useCurrentUser";
import dayjs from "dayjs";

export const useProfessorDashboard = (profesorId?: string) => {
  const { user: currentUser, loading: userLoading } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    cursosActivos: 0,
    totalEstudiantes: 0,
    horasMes: 0,
  });
  const [cursos, setCursos] = useState<any[]>([]);

  useEffect(() => {
    const fetchDashboard = async () => {
      // 1. Determinar ID: o viene por prop (admin viendo) o es el usuario actual
      const targetId = profesorId || currentUser?.id;

      // Si no hay ID y el usuario ya terminó de cargar (o no hay sesión), terminamos
      if (!targetId) {
        if (!userLoading) setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // A. Obtener Cursos del profesor (se mantiene como primera llamada)
        const cursosPromise = supabaseBrowserClient
          .from("cursos")
          .select("id, nombre, estado")
          .eq("profesor_id", targetId)
          .neq("estado", "eliminado"); // Excluir eliminados (soft delete)

        const { data: cursosData, error: cursosError } = await cursosPromise;
        if (cursosError) throw cursosError;

        const cursosActivos = cursosData?.filter((c) => c.estado === "activo") || [];
        const cursoIds = cursosData?.map((c) => c.id) || [];

        // B. y C. se ejecutan en paralelo
        const [estudiantesCountResult, sesionesDataResult] = await Promise.all([
          // B. Contar Estudiantes Activos
          cursoIds.length > 0
            ? supabaseBrowserClient
            .from("matriculas")
            .select("id", { count: "exact", head: true })
            .eq("estado", "activo")
            .in("curso_id", cursoIds)
            : Promise.resolve({ count: 0, error: null }),
          
          // C. Sumar Horas Dictadas en el mes actual
          supabaseBrowserClient
            .from("sesiones_clase")
            .select("horas_dictadas")
            .eq("profesor_id", targetId)
            .gte("fecha", dayjs().startOf("month").format("YYYY-MM-DD"))
            .lte("fecha", dayjs().endOf("month").format("YYYY-MM-DD")),
        ]);

        const totalEstudiantes = estudiantesCountResult.count || 0;
        const sesionesData = sesionesDataResult.data || [];
        const horasMes = sesionesData?.reduce((acc, curr) => acc + (Number(curr.horas_dictadas) || 0), 0) || 0;

        setStats({
          cursosActivos: cursosActivos.length,
          totalEstudiantes,
          horasMes,
        });
        setCursos(cursosData || []);
      } catch (error) {
        // Manejo silencioso o reporte a servicio de logs
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [profesorId, currentUser, userLoading]);

  return { loading, stats, cursos };
};
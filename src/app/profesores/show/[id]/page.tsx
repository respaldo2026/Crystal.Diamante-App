"use client";

import React from "react";
import { useParams } from "next/navigation";
import { obtenerDashboardProfesor } from "@modules/academico/profesores.service";
import { ProfessorDashboardUI } from "../../../../components/profesor/ProfessorDashboardUI";

export default function ShowProfesorDashboard() {
  const params = useParams();
  const idProfesor = params?.id as string;
  const [dashboard, setDashboard] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!idProfesor) return;
    setLoading(true);
    obtenerDashboardProfesor(idProfesor)
      .then((data) => setDashboard(data))
      .finally(() => setLoading(false));
  }, [idProfesor]);

  if (loading) return <div style={{ padding: 20 }}>Cargando dashboard del profesor...</div>;
  return <ProfessorDashboardUI dashboard={dashboard} />;
}
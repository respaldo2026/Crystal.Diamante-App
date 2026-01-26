"use client";

import React from "react";
import { useProfessorDashboard } from "@hooks/useProfessorDashboard";
import { ProfessorDashboardUI } from "../../components/profesor/ProfessorDashboardUI";
import { useRouter } from "next/navigation";

export default function MiOficinaProfesor() {
  const dashboard = useProfessorDashboard();
  const router = useRouter();

  return (
    <ProfessorDashboardUI
      dashboard={dashboard}
      onOpenCourse={(cursoId) => {
        if (!cursoId) return;
        router.push(`/cursos/show/${cursoId}`);
      }}
    />
  );
}

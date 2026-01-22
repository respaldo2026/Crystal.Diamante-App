"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useProfessorDashboard } from "@hooks/useProfessorDashboard";
import { ProfessorDashboardUI } from "@/components/profesor/ProfessorDashboardUI";

export default function ShowProfesorDashboard() {
  const params = useParams();
  const idProfesor = params?.id as string;
  const dashboard = useProfessorDashboard(idProfesor);
  return <ProfessorDashboardUI dashboard={dashboard} />;
}
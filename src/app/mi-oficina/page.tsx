"use client";

import React from "react";
import { useProfessorDashboard } from "@hooks/useProfessorDashboard";
import { ProfessorDashboardUI } from "../../components/profesor/ProfessorDashboardUI";

export default function MiOficinaProfesor() {
  const dashboard = useProfessorDashboard();
  return <ProfessorDashboardUI dashboard={dashboard} />;
}

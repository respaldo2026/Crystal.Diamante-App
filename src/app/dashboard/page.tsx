"use client";
import { useEffect, useState } from "react";
import AdminDashboard from "./admin";
import DirectorDashboard from "./director";
import ProfesorDashboard from "./profesor";
import EstudianteDashboard from "./estudiante";
import SecretariaDashboard from "./secretaria";
import { supabaseBrowserClient as supabase } from "@utils/supabase/client";

export default function DashboardPage() {
  const [rol, setRol] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRol() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRol(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
      setRol(data?.rol || null);
      setLoading(false);
    }
    fetchRol();
  }, []);

  if (loading) return <div>Cargando...</div>;
  if (!rol) return <div>No tienes acceso a este panel.</div>;

  if (rol === "admin") return <AdminDashboard />;
  if (rol === "director") return <DirectorDashboard />;
  if (rol === "profesor") return <ProfesorDashboard />;
  if (rol === "estudiante") return <EstudianteDashboard />;
  if (rol === "secretaria") return <SecretariaDashboard />;

  return <div>Panel no disponible para tu rol.</div>;
}

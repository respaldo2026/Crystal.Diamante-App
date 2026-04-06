import dayjs from "dayjs";

const formatearDias = (dias?: string | string[] | null) => {
  if (!dias) return "";
  const diasList = Array.isArray(dias) ? dias : dias.split(",");
  return diasList
    .map((d) => String(d).trim())
    .filter(Boolean)
    .map((dia) => dia.charAt(0).toUpperCase() + dia.slice(1))
    .join(" · ");
};

const formatearHoraInicio = (valor?: string | null) => {
  if (!valor) return "";
  const match = String(valor).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";

  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute) || hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) {
    return "";
  }

  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  const minuteText = String(minute).padStart(2, "0");
  return `${hour12}:${minuteText}${suffix}`;
};

const formatearHorarioLibre = (horario?: string | null) => {
  const raw = String(horario || "").trim();
  return raw || "";
};

type GrupoLike = {
  nombre?: string | null;
  programa_nombre?: string | null;
  programaNombre?: string | null;
  programas?: { nombre?: string | null } | null;
  dias_semana?: string | string[] | null;
  diasSemana?: string | string[] | null;
  hora_inicio?: string | null;
  horaInicio?: string | null;
  hora_fin?: string | null;
  horaFin?: string | null;
  horario?: string | null;
};

export const construirNombreGrupo = (grupo?: GrupoLike | null) => {
  if (!grupo) return "Grupo";
  const programa = grupo.programas?.nombre || grupo.programa_nombre || grupo.programaNombre || "";
  const dias = formatearDias(grupo.dias_semana ?? grupo.diasSemana ?? null);
  const horario = formatearHoraInicio(grupo.hora_inicio || grupo.horaInicio || null)
    || formatearHorarioLibre(grupo.horario);
  const partes = [programa, dias, horario].filter(Boolean);
  if (partes.length > 0) return partes.join(" ");
  return grupo.nombre || "Grupo";
};

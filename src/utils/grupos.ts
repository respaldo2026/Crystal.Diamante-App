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

const formatearHorario = (inicio?: string | null, fin?: string | null) => {
  if (!inicio && !fin) return "";
  const formato = (valor: string | null | undefined) => {
    if (!valor) return "";
    const parsed = dayjs(valor, ["HH:mm:ss", "HH:mm"], true);
    if (parsed.isValid()) return parsed.format("hh:mm A");
    return "";
  };
  const inicioFmt = formato(inicio);
  const finFmt = formato(fin);
  if (inicioFmt && finFmt) {
    return `${inicioFmt} - ${finFmt}`;
  }
  return inicioFmt || finFmt || "";
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
  const horario = formatearHorario(grupo.hora_inicio || grupo.horaInicio || null, grupo.hora_fin || grupo.horaFin || null)
    || formatearHorarioLibre(grupo.horario);
  const partes = [programa, dias, horario].filter(Boolean);
  if (partes.length > 0) return partes.join(" · ");
  return grupo.nombre || "Grupo";
};

"use client";

import { useCallback, useMemo } from "react";

type UseTemaMaterialsParams = {
  matriculas: any[];
  matriculaRutaId: string | null;
  pensum: any[];
  materiales: any[];
  materialesClase: any[];
  materialesCiclo: any[];
  deduplicarListaAction: <T>(items: T[], resolverClave: (item: T) => string) => T[];
  normalizarTextoAction: (value?: string | null) => string;
  normalizarTemaComparacionAction: (value?: string | null) => string;
  parseTemaTituloMaterialAction: (value?: string | null) => { tema: string; tituloLimpio: string };
  getMaterialCanonicalKeyAction: (material: any, temaNombre?: string) => string;
};

export const useTemaMaterials = ({
  matriculas,
  matriculaRutaId,
  pensum,
  materiales,
  materialesClase,
  materialesCiclo,
  deduplicarListaAction,
  normalizarTextoAction,
  normalizarTemaComparacionAction,
  parseTemaTituloMaterialAction,
  getMaterialCanonicalKeyAction,
}: UseTemaMaterialsParams) => {
  const matriculasActivas = useMemo(
    () =>
      deduplicarListaAction(
        (matriculas || []).filter((m: any) => m.estado !== "cancelado"),
        (m: any) => String(m?.id)
      ),
    [deduplicarListaAction, matriculas]
  );

  const matriculaSeleccionada = useMemo(
    () =>
      matriculasActivas.find((m: any) => String(m.id) === String(matriculaRutaId)) ||
      matriculasActivas[0] ||
      null,
    [matriculaRutaId, matriculasActivas]
  );

  const programaIdSeleccionado = matriculaSeleccionada?.cursos?.programa_id;

  const ciclosPrograma = useMemo(
    () =>
      deduplicarListaAction(
        (pensum || []).filter((p: any) => p.programa_id === programaIdSeleccionado),
        (ciclo: any) => String(ciclo?.id || `${ciclo?.programa_id || ""}-${ciclo?.nombre_ciclo || ""}-${ciclo?.numero_ciclo || ""}`)
      ).sort((a: any, b: any) => {
        const ordenA = Number(a?.orden ?? a?.numero_ciclo ?? 0);
        const ordenB = Number(b?.orden ?? b?.numero_ciclo ?? 0);
        if (ordenA !== ordenB) return ordenA - ordenB;
        return Number(a?.id || 0) - Number(b?.id || 0);
      }),
    [deduplicarListaAction, pensum, programaIdSeleccionado]
  );

  const materialesPrograma = useMemo(
    () =>
      deduplicarListaAction(
        (materiales || []).filter((m: any) => String(m?.programa_id) === String(programaIdSeleccionado)),
        (m: any) => getMaterialCanonicalKeyAction(m)
      ),
    [deduplicarListaAction, getMaterialCanonicalKeyAction, materiales, programaIdSeleccionado]
  );

  const materialesClasePrograma = useMemo(
    () =>
      deduplicarListaAction(
        (materialesClase || []).filter((m: any) => String(m?.programa_id) === String(programaIdSeleccionado)),
        (m: any) =>
          String(
            `${m?.pensum_id || ""}-${m?.pensum_curso_id || ""}-${normalizarTextoAction(m?.materiales_ciclo?.nombre || m?.nombre_material || "")}-${m?.materiales_ciclo?.cantidad || m?.cantidad || ""}-${normalizarTextoAction(m?.unidad || "")}`
          )
      ),
    [deduplicarListaAction, materialesClase, normalizarTextoAction, programaIdSeleccionado]
  );

  const materialesCicloPrograma = useMemo(
    () =>
      deduplicarListaAction(
        (materialesCiclo || []).filter((m: any) => String(m?.programa_id) === String(programaIdSeleccionado)),
        (m: any) => String(m?.id || `${normalizarTextoAction(m?.nombre || "")}-${m?.cantidad || ""}-${m?.pensum_id || ""}`)
      ),
    [deduplicarListaAction, materialesCiclo, normalizarTextoAction, programaIdSeleccionado]
  );

  const obtenerTemasCiclo = useCallback(
    (ciclo: any) =>
      deduplicarListaAction(
        ciclo?.pensum_cursos || [],
        (tema: any) => String(tema?.id || normalizarTextoAction(tema?.nombre_curso || ""))
      ).sort((a: any, b: any) => {
        const ordenA = Number(a?.orden ?? 0);
        const ordenB = Number(b?.orden ?? 0);
        if (ordenA !== ordenB) return ordenA - ordenB;
        return Number(a?.id || 0) - Number(b?.id || 0);
      }),
    [deduplicarListaAction, normalizarTextoAction]
  );

  const obtenerRecursosTema = useCallback(
    (tema: any, cicloId?: string) =>
      deduplicarListaAction(
        materialesPrograma.filter((material: any) => {
          if (!tema) return false;
          if (cicloId && String(material?.pensum_id || "") !== String(cicloId)) return false;

          const temaIdMaterial = String(material?.pensum_curso_id || material?.pensum_cursos?.id || "");
          const temaIdObjetivo = String(tema?.id || "");
          if (temaIdMaterial && temaIdObjetivo) {
            return temaIdMaterial === temaIdObjetivo;
          }

          const parsed = parseTemaTituloMaterialAction(material.titulo);
          const temaMaterial = normalizarTemaComparacionAction(parsed.tema);
          const temaObjetivo = normalizarTemaComparacionAction(tema.nombre_curso);
          const tituloLimpio = normalizarTextoAction(parsed.tituloLimpio);
          const descripcion = normalizarTextoAction(material.descripcion || "");

          if (!temaObjetivo) return true;
          if (temaMaterial) return temaMaterial === temaObjetivo;
          return tituloLimpio.includes(temaObjetivo) || descripcion.includes(temaObjetivo);
        }),
        (m: any) => getMaterialCanonicalKeyAction(m, tema?.nombre_curso)
      ),
    [
      deduplicarListaAction,
      getMaterialCanonicalKeyAction,
      materialesPrograma,
      normalizarTemaComparacionAction,
      normalizarTextoAction,
      parseTemaTituloMaterialAction,
    ]
  );

  const obtenerInsumosTema = useCallback(
    (tema: any, cicloId?: string) =>
      deduplicarListaAction(
        materialesClasePrograma.filter((item: any) => {
          if (!tema) return false;
          if (cicloId && item.pensum_id && String(item.pensum_id) !== String(cicloId)) return false;
          return String(item.pensum_curso_id) === String(tema.id);
        }),
        (m: any) =>
          `${normalizarTextoAction(m?.materiales_ciclo?.nombre || m?.nombre_material || "")}-${m?.materiales_ciclo?.cantidad || m?.cantidad || ""}-${normalizarTextoAction(m?.unidad || "")}`
      ),
    [deduplicarListaAction, materialesClasePrograma, normalizarTextoAction]
  );

  const obtenerMaterialesCiclo = useCallback(
    (cicloId?: string) =>
      deduplicarListaAction(
        materialesCicloPrograma.filter((item: any) => (cicloId ? String(item?.pensum_id) === String(cicloId) : false)),
        (m: any) => String(m?.id || `${normalizarTextoAction(m?.nombre || "")}-${m?.cantidad || ""}`)
      ),
    [deduplicarListaAction, materialesCicloPrograma, normalizarTextoAction]
  );

  const obtenerTemaPorId = useCallback(
    (temaRutaId?: string | null) => {
      if (!temaRutaId) return null;
      for (const ciclo of ciclosPrograma) {
        const tema = (obtenerTemasCiclo(ciclo) || []).find((t: any) => String(t?.id) === String(temaRutaId));
        if (tema) return tema;
      }
      return null;
    },
    [ciclosPrograma, obtenerTemasCiclo]
  );

  return {
    matriculasActivas,
    matriculaSeleccionada,
    ciclosPrograma,
    obtenerTemasCiclo,
    obtenerRecursosTema,
    obtenerInsumosTema,
    obtenerMaterialesCiclo,
    obtenerTemaPorId,
  };
};

$file = "src\app\rentabilidad\page.tsx"
$c = Get-Content $file -Raw -Encoding UTF8

# 1. Si aun existe SesionEgreso, reemplazar con PagoNomina completo
$c = $c -replace 'type SesionEgreso = \{[\s\S]*?\};[\r\n]+', ''

# 2. Asegurarse que ResumenProfesor sea el simple
$c = $c -replace 'type ResumenProfesor = \{[\s\S]*?\};', "type ResumenProfesor = {`r`n  nombre: string;`r`n  horas: number;`r`n  total: number;`r`n};"

# 3. Reemplazar estado sesionesClase por pagosNomina
$c = $c -replace 'const \[sesionesClase, setSesionesClase\] = useState<SesionEgreso\[\]>\(\[\]\)', 'const [pagosNomina, setPagosNomina] = useState<PagoNomina[]>([])'

# 4. Reemplazar el bloque de query sesiones_clase con pagos_nomina
$oldQuery = @'
    // Egresos: horas dictadas por profesores (pagadas o pendientes)
    const { data: sesionesData } = await supabaseBrowserClient
      .from("sesiones_clase")
      .select(
        "id, fecha, horas_dictadas, estado_pago, perfiles!sesiones_clase_profesor_id_fkey(nombre_completo, valor_hora), cursos(nombre)"
      )
      .gte("fecha", inicio)
      .lte("fecha", fin);

    const sesionesParsed: SesionEgreso[] = ((sesionesData as any[]) || []).map((s) => {
      const valorHora = Number(s.perfiles?.valor_hora) || 0;
      const horas = Number(s.horas_dictadas) || 0;
      return {
        id: s.id,
        fecha: s.fecha,
        profesor_nombre: s.perfiles?.nombre_completo || "Sin nombre",
        valor_hora: valorHora,
        horas_dictadas: horas,
        costo: horas * valorHora,
        estado_pago: s.estado_pago === "pagado" ? "pagado" : "pendiente",
        curso_nombre: s.cursos?.nombre || "Sin curso",
      };
    });
    setSesionesClase(sesionesParsed);
'@

$newQuery = @'
    // Egresos: pagos reales a profesoras (pagos_nomina)
    const { data: nominaData } = await supabaseBrowserClient
      .from("pagos_nomina")
      .select("id, fecha_pago, total_pagado, total_horas, perfiles(nombre_completo)")
      .gte("fecha_pago", inicio)
      .lte("fecha_pago", fin);

    const nominaParsed: PagoNomina[] = ((nominaData as any[]) || []).map((n) => ({
      id: n.id,
      fecha_pago: n.fecha_pago,
      total_pagado: Number(n.total_pagado) || 0,
      total_horas: Number(n.total_horas) || 0,
      profesor_nombre: n.perfiles?.nombre_completo || "Sin nombre",
    }));
    setPagosNomina(nominaParsed);
'@

$c = $c.Replace($oldQuery, $newQuery)

# 5. Reemplazar bloque de useMemo totalEgresos (varios)
$oldMemos = @'
  const totalEgresos = useMemo(
    () => sesionesClase.reduce((s, p) => s + p.costo, 0),
    [sesionesClase]
  );
  const totalEgresosPagado = useMemo(
    () => sesionesClase.filter((s) => s.estado_pago === "pagado").reduce((s, p) => s + p.costo, 0),
    [sesionesClase]
  );
  const totalEgresosPendiente = useMemo(
    () => sesionesClase.filter((s) => s.estado_pago === "pendiente").reduce((s, p) => s + p.costo, 0),
    [sesionesClase]
  );
  const totalHorasDictadas = useMemo(
    () => sesionesClase.reduce((s, p) => s + p.horas_dictadas, 0),
    [sesionesClase]
  );
'@

$newMemos = @'
  const totalEgresos = useMemo(
    () => pagosNomina.reduce((s, p) => s + p.total_pagado, 0),
    [pagosNomina]
  );
  const totalHorasPagadas = useMemo(
    () => pagosNomina.reduce((s, p) => s + p.total_horas, 0),
    [pagosNomina]
  );
'@

$c = $c.Replace($oldMemos, $newMemos)

# 6. Reemplazar egresosPorProfesor useMemo
$oldEgresos = @'
  const egresosPorProfesor = useMemo<ResumenProfesor[]>(() => {
    const map: Record<string, ResumenProfesor> = {};
    sesionesClase.forEach((s) => {
      if (!map[s.profesor_nombre])
        map[s.profesor_nombre] = {
          nombre: s.profesor_nombre,
          horas: 0,
          valor_hora: s.valor_hora,
          total: 0,
          pagado: 0,
          pendiente: 0,
        };
      const entry = map[s.profesor_nombre]!;
      entry.horas += s.horas_dictadas;
      entry.total += s.costo;
      if (s.estado_pago === "pagado") entry.pagado += s.costo;
      else entry.pendiente += s.costo;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [sesionesClase]);
'@

$newEgresos = @'
  const egresosPorProfesor = useMemo<ResumenProfesor[]>(() => {
    const map: Record<string, ResumenProfesor> = {};
    pagosNomina.forEach((p) => {
      if (!map[p.profesor_nombre])
        map[p.profesor_nombre] = { nombre: p.profesor_nombre, horas: 0, total: 0 };
      const entry = map[p.profesor_nombre]!;
      entry.horas += p.total_horas;
      entry.total += p.total_pagado;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [pagosNomina]);
'@

$c = $c.Replace($oldEgresos, $newEgresos)

# 7. Reemplazar referencias restantes a sesionesClase
$c = $c -replace 'sesionesClase\.length', 'pagosNomina.length'

# 8. Eliminar referencias a totalEgresosPagado y totalEgresosPendiente en KPI
$c = $c -replace '\{totalHorasDictadas\}h dictadas &bull; Pag: \{formatoCOP\(totalEgresosPagado\)\} &bull; Pend: \{formatoCOP\(totalEgresosPendiente\)\}', '{totalHorasPagadas}h liquidadas'

# 9. Limpiar extra= con tags de pagado/pendiente en la card de egresos si quedan
$c = $c -replace 'extra=\{[\s\S]*?<Tag color="red">Pagado:[\s\S]*?</Space>\s*\}[\s\S]*?\n', ''

# 10. Actualizar columnas de tabla de egresos - eliminar Pagado/Pendiente/Total, queda Horas/Total
$c = $c -replace '\{sesionesClase\.length === 0', '{pagosNomina.length === 0'
$c = $c -replace 'No hay clases registradas en este periodo', 'Sin pagos a profesoras en este periodo'
$c = $c -replace 'totalEgresosPagado', 'totalEgresos'
$c = $c -replace 'totalEgresosPendiente', '0'
$c = $c -replace 'totalHorasDictadas', 'totalHorasPagadas'

Set-Content $file -Value $c -Encoding UTF8 -NoNewline
Write-Output "Done. Length=$($c.Length)"

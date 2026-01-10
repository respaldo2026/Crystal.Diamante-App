"use client";

import React, { useEffect, useState } from "react";
import { Typography, Row, Col, Card, Statistic, List, Avatar, Button, Spin, Tag, Divider, Modal, Form, Input, Space, Switch } from "antd";
import {
    DollarCircleOutlined, TeamOutlined, BookOutlined,
    UserOutlined, RiseOutlined, FallOutlined, WalletOutlined,
    GiftOutlined, WhatsAppOutlined, CalendarOutlined, PlusOutlined, DeleteOutlined, HolderOutlined
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { useNavigation } from "@refinedev/core"; // Usamos la navegación de Refine
import dayjs from "dayjs";
import { formatDate } from "@utils/date";
import 'dayjs/locale/es';
import { enviarWhatsapp } from "@utils/whatsapp";

dayjs.locale('es');

const { Title, Text } = Typography;

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const { list } = useNavigation(); // Hook para navegar
  
  // Estadísticas
  const [stats, setStats] = useState({
    ingresosMes: 0,
    egresosMes: 0,
    estudiantesActivos: 0,
    cursosActivos: 0,
    profesores: 0
  });

    // Listas recientes
    const [ultimosPagos, setUltimosPagos] = useState<any[]>([]);
    const [cumplesHoy, setCumplesHoy] = useState<any[]>([]);
    const [proximosCursos, setProximosCursos] = useState<any[]>([]);
    const [inscritosPorCurso, setInscritosPorCurso] = useState<Record<number, number>>({});
    const [cursosActivosPorPrograma, setCursosActivosPorPrograma] = useState<{
        programaId: number;
        programaNombre: string;
        cursos: { id: number; nombre: string; cuposDisponibles: number | null; cuposTotales: number | null; fecha_inicio: string | null }[];
    }[]>([]);

    const defaultKpiOrder = ["ingresos", "egresos", "balance", "estudiantes", "cursos", "profesores"];
    const [kpiOrder, setKpiOrder] = useState<string[]>(defaultKpiOrder);

    const defaultCardOrder = ["proximos", "activos", "cumple", "ingresosRecientes", "accesos"];
    const [cardOrder, setCardOrder] = useState<string[]>(defaultCardOrder);

    const defaultVisibility = {
        proximos: true,
        activos: true,
        cumple: true,
        ingresosRecientes: true,
        accesos: true,
    };
    const [cardVisibility, setCardVisibility] = useState(defaultVisibility);

    type QuickLink = { id: string; label: string; href: string; danger?: boolean; primary?: boolean };
    const defaultQuickLinks: QuickLink[] = [
        { id: "matriculas", label: "Matricular Estudiante", href: "/matriculas", primary: true },
        { id: "ingreso", label: "Registrar Ingreso", href: "/tesoreria/create" },
        { id: "nomina", label: "Pagar Nómina", href: "/nomina", danger: true },
    ];
    const [quickLinks, setQuickLinks] = useState<QuickLink[]>(defaultQuickLinks);
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [linkForm] = Form.useForm();

  useEffect(() => {
    cargarDashboardGeneral();
    if (typeof window !== "undefined") {
        const storedKpis = window.localStorage.getItem("dashboardKpiOrder_v1");
        const storedLinks = window.localStorage.getItem("dashboardQuickLinks_v1");
        const storedVisibility = window.localStorage.getItem("dashboardVisibility_v1");
        const storedCards = window.localStorage.getItem("dashboardCardOrder_v1");
        if (storedKpis) {
            try { setKpiOrder(JSON.parse(storedKpis)); } catch {}
        }
        if (storedLinks) {
            try { setQuickLinks(JSON.parse(storedLinks)); } catch {}
        }
        if (storedVisibility) {
            try { setCardVisibility(JSON.parse(storedVisibility)); } catch {}
        }
        if (storedCards) {
            try { setCardOrder(JSON.parse(storedCards)); } catch {}
        }
    }
  }, []);

  const cargarDashboardGeneral = async () => {
    setLoading(true);
    try {
        const hoy = dayjs();
        const inicioMes = hoy.startOf('month').format('YYYY-MM-DD');

        // 1. Ingresos (Tabla 'pagos')
        const { data: pagosMes } = await supabaseBrowserClient
            .from("pagos")
            .select("monto")
            .gte("fecha_pago", inicioMes);
        
        const totalIngresos = pagosMes?.reduce((acc, curr) => acc + Number(curr.monto), 0) || 0;

        // 2. Egresos (Tabla 'pagos_nomina')
        // Nota: la columna correcta es 'total_pagado' (no 'monto')
        const { data: nominaMes } = await supabaseBrowserClient
            .from("pagos_nomina")
            .select("total_pagado")
            .gte("fecha_pago", inicioMes);
            
        const totalEgresos = nominaMes?.reduce((acc, curr) => acc + Number((curr as any).total_pagado || 0), 0) || 0;

        // 3. Contadores básicos
        // Contar estudiantes únicos (desde perfiles con rol estudiante)
        const { count: countEstudiantesTotales } = await supabaseBrowserClient
            .from("perfiles")
            .select("*", { count: 'exact', head: true })
            .eq("rol", "estudiante");

        // Contar matrículas activas
        const { count: countMatriculasActivas } = await supabaseBrowserClient
            .from("matriculas")
            .select("*", { count: 'exact', head: true })
            .eq("estado", "activo");

        const { count: countProfes } = await supabaseBrowserClient
            .from("perfiles")
            .select("*", { count: 'exact', head: true })
            .eq("rol", "profesor");

        const { count: countCursos } = await supabaseBrowserClient
            .from("cursos")
            .select("*", { count: 'exact', head: true });

        // 4. Últimos Pagos
        const { data: dataUltimosPagos } = await supabaseBrowserClient
            .from("pagos")
            .select(`
                id, monto, created_at,
                perfiles (nombre_completo),
                matriculas ( cursos (nombre) )
            `)
            .order("created_at", { ascending: false })
            .limit(5);

        // 5. Cumpleaños del día (estudiantes activos)
        // No podemos hacer LIKE en fecha directamente, traemos todos y filtramos
        const { data: dataCumplesRaw } = await supabaseBrowserClient
            .from("perfiles")
            .select(`
              id,
              nombre_completo,
              telefono,
              telefono_2,
              fecha_nacimiento,
              matriculas!inner(estado)
            `)
            .eq("rol", "estudiante")
            .eq("matriculas.estado", "activo")
            .not("fecha_nacimiento", "is", null);

        // Filtrar por mes y día actual
        const mesHoy = hoy.format('MM');
        const diaHoy = hoy.format('DD');
        const dataCumples = dataCumplesRaw?.filter(perfil => {
            if (!perfil.fecha_nacimiento) return false;
            const fecha = dayjs(perfil.fecha_nacimiento);
            return fecha.format('MM-DD') === `${mesHoy}-${diaHoy}`;
        }) || [];

        // Evitamos duplicados si un estudiante tiene más de una matrícula activa
        const cumpleUnicos = Array.from(
            new Map((dataCumples || []).map((item) => [item.id, item])).values()
        );

        // 6. Próximos cursos a iniciar
        const { data: dataProximosCursos } = await supabaseBrowserClient
            .from("cursos")
            .select("id, nombre, fecha_inicio, cupos, estado")
            .gte("fecha_inicio", hoy.format('YYYY-MM-DD'))
            .in("estado", ["proximo", "activo"])
            .order("fecha_inicio", { ascending: true })
            .limit(5);

        const proximos = dataProximosCursos || [];
        let ocupados: Record<number, number> = {};

        if (proximos.length) {
            const cursoIds = proximos.map((c: any) => c.id);
            const { data: dataMatriculas } = await supabaseBrowserClient
                .from("matriculas")
                .select("curso_id")
                .in("curso_id", cursoIds)
                .eq("estado", "activo");

            const conteo: Record<number, number> = {};
            (dataMatriculas || []).forEach((m: any) => {
                const id = Number(m.curso_id);
                conteo[id] = (conteo[id] || 0) + 1;
            });
            ocupados = conteo;
        }

        // 7. Cursos activos agrupados por programa
        const { data: dataCursosActivos } = await supabaseBrowserClient
            .from("cursos")
            .select("id, nombre, cupos, fecha_inicio, programa_id, matriculas(count)")
            .eq("estado", "activo");

        const { data: dataProgramas } = await supabaseBrowserClient
            .from("programas")
            .select("id, nombre");

        const programasMap = new Map<number, string>();
        (dataProgramas || []).forEach((p: any) => {
            programasMap.set(Number(p.id), p.nombre);
        });

        const agrupadoPorPrograma: Record<number, { id: number; nombre: string; cuposDisponibles: number | null; cuposTotales: number | null; fecha_inicio: string | null }[]> = {};

        (dataCursosActivos || []).forEach((curso: any) => {
            const inscritos = curso?.matriculas?.[0]?.count ?? 0;
            const cuposTotales = curso?.cupos ?? null;
            const cuposDisponibles = cuposTotales !== null ? Math.max(cuposTotales - inscritos, 0) : null;
            const key = Number(curso.programa_id);
            if (!agrupadoPorPrograma[key]) agrupadoPorPrograma[key] = [];
            agrupadoPorPrograma[key].push({
                id: curso.id,
                nombre: curso.nombre,
                cuposDisponibles,
                cuposTotales,
                fecha_inicio: curso.fecha_inicio || null,
            });
        });

        const agrupadoLista = Object.entries(agrupadoPorPrograma).map(([programaId, cursos]) => ({
            programaId: Number(programaId),
            programaNombre: programasMap.get(Number(programaId)) || "Programa",
            cursos: cursos.sort((a, b) => {
                if (!a.fecha_inicio) return 1;
                if (!b.fecha_inicio) return -1;
                return dayjs(a.fecha_inicio).diff(dayjs(b.fecha_inicio));
            })
        }));

        setStats({
            ingresosMes: totalIngresos,
            egresosMes: totalEgresos,
            estudiantesActivos: countEstudiantesTotales || 0,
            cursosActivos: countCursos || 0,
            profesores: countProfes || 0
        });

        setUltimosPagos(dataUltimosPagos || []);
        setCumplesHoy(cumpleUnicos);
        setProximosCursos(proximos);
        setInscritosPorCurso(ocupados);
        setCursosActivosPorPrograma(agrupadoLista);

    } catch (error) {
        console.error("Error cargando dashboard:", error);
    } finally {
        setLoading(false);
    }
  };

    const persistKpis = (order: string[]) => {
        setKpiOrder(order);
        if (typeof window !== "undefined") {
                window.localStorage.setItem("dashboardKpiOrder_v1", JSON.stringify(order));
        }
    };

    const persistLinks = (links: QuickLink[]) => {
        setQuickLinks(links);
        if (typeof window !== "undefined") {
                window.localStorage.setItem("dashboardQuickLinks_v1", JSON.stringify(links));
        }
    };

    const persistVisibility = (vis: typeof defaultVisibility) => {
        setCardVisibility(vis);
        if (typeof window !== "undefined") {
                window.localStorage.setItem("dashboardVisibility_v1", JSON.stringify(vis));
        }
    };

    const persistCards = (order: string[]) => {
        setCardOrder(order);
        if (typeof window !== "undefined") {
                window.localStorage.setItem("dashboardCardOrder_v1", JSON.stringify(order));
        }
    };

    const handleKpiDrop = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const current = [...kpiOrder];
        const fromIndex = current.indexOf(fromId);
        const toIndex = current.indexOf(toId);
        if (fromIndex === -1 || toIndex === -1) return;
        current.splice(fromIndex, 1);
        current.splice(toIndex, 0, fromId);
        persistKpis(current);
    };

    const handleLinkDrop = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const current = [...quickLinks];
        const fromIndex = current.findIndex((l) => l.id === fromId);
        const toIndex = current.findIndex((l) => l.id === toId);
        if (fromIndex === -1 || toIndex === -1) return;
        const [item] = current.splice(fromIndex, 1);
        current.splice(toIndex, 0, item);
        persistLinks(current);
    };

    const handleCardDrop = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const current = [...cardOrder];
        const fromIndex = current.indexOf(fromId);
        const toIndex = current.indexOf(toId);
        if (fromIndex === -1 || toIndex === -1) return;
        current.splice(fromIndex, 1);
        current.splice(toIndex, 0, fromId);
        persistCards(current);
    };

    const handleAddLink = () => {
        linkForm.validateFields().then((values) => {
                const href = values.href.startsWith("/") ? values.href : `/${values.href}`;
                const newLink: QuickLink = {
                        id: `${values.label}-${Date.now()}`,
                        label: values.label,
                        href,
                };
                const updated = [...quickLinks, newLink];
                persistLinks(updated);
                linkForm.resetFields();
                setLinkModalOpen(false);
        });
    };

    const handleRemoveLink = (id: string) => {
        const filtered = quickLinks.filter((l) => l.id !== id);
        persistLinks(filtered);
    };

    const resetLayout = () => {
        persistKpis(defaultKpiOrder);
        persistLinks(defaultQuickLinks);
        persistVisibility(defaultVisibility);
        persistCards(defaultCardOrder);
    };

  const balanceNeto = stats.ingresosMes - stats.egresosMes;

    const felicitar = (estudiante: any) => {
        const telefono = estudiante.telefono || estudiante.telefono_2;
        const primerNombre = estudiante.nombre_completo?.split(" ")[0] || "";
        const edad = estudiante.fecha_nacimiento ? dayjs().diff(dayjs(estudiante.fecha_nacimiento), 'year') : undefined;
        const mensajeBase = `Hola ${primerNombre}! 🎉 Desde Crystal queremos desearte un feliz cumpleaños. Que este nuevo año esté lleno de logros y aprendizaje.`;
        const mensaje = edad ? `${mensajeBase} ¡Felices ${edad}!` : mensajeBase;
        enviarWhatsapp(telefono, mensaje);
    };

  // Función genérica para navegar
  const irA = (ruta: string) => {
      window.location.href = ruta;
  };

  const renderCard = (cardId: string) => {
        if (cardId === "proximos") {
            return (
                <Card
                    title={<Space size={6}><HolderOutlined style={{ fontSize: 12, color: '#999' }} />📅 Próximos grupos</Space>}
                    extra={<Tag color="blue">{proximosCursos.length} grupo(s)</Tag>}
                    style={{ height: 240 }}
                    styles={{ body: { padding: 8, maxHeight: 190, overflow: 'auto' } }}
                >
                        <List
                            itemLayout="horizontal"
                            dataSource={proximosCursos.slice(0, 3)}
                            renderItem={(curso) => {
                                const inscritos = inscritosPorCurso[curso.id] || 0;
                                const cuposDisponibles = curso.cupos !== null && curso.cupos !== undefined
                                    ? Math.max(curso.cupos - inscritos, 0)
                                    : null;

                                return (
                                <List.Item style={{ padding: '4px 0' }}>
                                        <List.Item.Meta
                                            avatar={<Avatar size="small" style={{ backgroundColor: '#e6f7ff', color: '#1890ff' }} icon={<CalendarOutlined />} />}
                                            title={<Text strong>{curso.nombre}</Text>}
                                            description={
                                                <span>
                                                    Inicio: {curso.fecha_inicio ? dayjs(curso.fecha_inicio).format("DD MMM") : "Sin fecha"}
                                                    {cuposDisponibles !== null ? ` • Cupos libres: ${cuposDisponibles}/${curso.cupos}` : ''}
                                                </span>
                                            }
                                        />
                                    </List.Item>
                                );
                            }}
                        />
                    {proximosCursos.length === 0 && <div style={{ padding: 8, textAlign: 'center', color: '#999' }}>No hay grupos próximos registrados.</div>}
                </Card>
            );
        }

        if (cardId === "activos") {
            return (
                <Card
                    title={<Space size={6}><HolderOutlined style={{ fontSize: 12, color: '#999' }} />🏷️ Grupos activos por programa</Space>}
                    extra={<Tag color="green">{cursosActivosPorPrograma.length} programa(s)</Tag>}
                    style={{ height: 240 }}
                    styles={{ body: { padding: 8, maxHeight: 190, overflow: 'auto' } }}
                >
                    {cursosActivosPorPrograma.length === 0 ? (
                        <div style={{ padding: 10, textAlign: "center", color: "#999" }}>No hay grupos activos</div>
                    ) : (
                        <List
                            dataSource={cursosActivosPorPrograma}
                            renderItem={(prog) => (
                                <List.Item style={{ padding: '3px 0' }}>
                                    <List.Item.Meta
                                        title={<Text strong>{prog.programaNombre}</Text>}
                                        description={
                                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                        {prog.cursos.map((curso) => {
                                                            const cuposInfo =
                                                                curso.cuposDisponibles !== null && curso.cuposTotales !== null
                                                                    ? `Cupos ${curso.cuposDisponibles}/${curso.cuposTotales}`
                                                                    : "Cupos N/D";
                                                            const fecha = curso.fecha_inicio
                                                                ? formatDate(curso.fecha_inicio)
                                                                : "Sin fecha";
                                                            return (
                                                                <div key={curso.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, border: "1px solid #f0f0f0", borderRadius: 6, padding: "4px 8px", background: "#fafafa" }}>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                                                        <Tag color={curso.cuposDisponibles && curso.cuposDisponibles <= 5 ? "orange" : "blue"} style={{ margin: 0 }}>
                                                                            {curso.nombre}
                                                                        </Tag>
                                                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                                                            {fecha} · {cuposInfo}
                                                                        </Text>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                        }
                                    />
                                </List.Item>
                            )}
                        />
                    )}
                </Card>
            );
        }

        if (cardId === "cumple") {
            return (
                <Card
                    title={<Space size={6}><HolderOutlined style={{ fontSize: 12, color: '#999' }} />🎂 Cumpleaños hoy</Space>}
                    extra={<Tag color="magenta">{cumplesHoy.length}</Tag>}
                    style={{ height: 240 }}
                    styles={{ body: { padding: 8, maxHeight: 190, overflow: 'auto' } }}
                >
                    <List
                        itemLayout="horizontal"
                        dataSource={cumplesHoy.slice(0, 3)}
                        renderItem={(item) => (
                            <List.Item
                                style={{ padding: '4px 0' }}
                                actions={[
                                    <Button
                                        key="felicitar"
                                        type="primary"
                                        icon={<WhatsAppOutlined />}
                                        size="small"
                                        onClick={() => felicitar(item)}
                                    />
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={<Avatar size="small" style={{ backgroundColor: '#fff1f0', color: '#d4380d' }} icon={<GiftOutlined />} />}
                                    title={<Text strong>{item.nombre_completo || "Estudiante"}</Text>}
                                    description={
                                        <span>
                                            {item.fecha_nacimiento ? dayjs(item.fecha_nacimiento).format("DD MMM") : "Sin fecha"}
                                            {item.telefono && ` • ${item.telefono}`}
                                            {!item.telefono && item.telefono_2 && ` • ${item.telefono_2}`}
                                        </span>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                    {cumplesHoy.length === 0 && <div style={{ padding: 8, textAlign: 'center', color: '#999' }}>No hay estudiantes de cumpleaños hoy.</div>}
                </Card>
            );
        }

        if (cardId === "ingresosRecientes") {
            return (
                <Card
                    title={<Space size={6}><HolderOutlined style={{ fontSize: 12, color: '#999' }} />💰 Ingresos Recientes</Space>}
                    extra={<Button type="link" size="small" onClick={() => irA('/tesoreria')}>Ver todo</Button>}
                    style={{ height: 240 }}
                    styles={{ body: { padding: 8, maxHeight: 190, overflow: 'auto' } }}
                >
                    <List
                        itemLayout="horizontal"
                        dataSource={ultimosPagos.slice(0, 5)}
                        renderItem={(item) => (
                            <List.Item style={{ padding: '4px 0' }}>
                                <List.Item.Meta
                                    avatar={<Avatar style={{backgroundColor: '#f6ffed', color: '#52c41a'}} icon={<DollarCircleOutlined />} />}
                                    title={<Text strong>{item.perfiles?.nombre_completo || "Estudiante"}</Text>}
                                    description={
                                        <span>
                                            {dayjs(item.created_at).format("DD MMM h:mm A")} • 
                                            {item.matriculas?.cursos?.nombre ? ` Grupo: ${item.matriculas.cursos.nombre}` : ' Pago general'}
                                        </span>
                                    }
                                />
                                <div style={{fontWeight: 'bold', color: '#3f8600'}}>
                                    + ${Number(item.monto).toLocaleString()}
                                </div>
                            </List.Item>
                        )}
                    />
                    {ultimosPagos.length === 0 && <div style={{padding:20, textAlign:'center', color:'#999'}}>No hay pagos recientes</div>}
                </Card>
            );
        }

        if (cardId === "accesos") {
            return (
                <Card
                    title={<Space size={6}><HolderOutlined style={{ fontSize: 12, color: '#999' }} />⚡ Accesos Directos</Space>}
                    extra={
                        <Space size={6}>
                            <Button size="small" icon={<PlusOutlined />} onClick={() => setLinkModalOpen(true)} />
                            <Button size="small" onClick={resetLayout}>Reset</Button>
                        </Space>
                    }
                    styles={{ body: { padding: 10 } }}
                    style={{ height: 240 }}
                >
                    <Space direction="vertical" style={{ width: "100%" }} size={6}>
                        {quickLinks.map((link) => (
                            <div
                                key={link.id}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData("quicklink", link.id)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    const from = e.dataTransfer.getData("quicklink");
                                    handleLinkDrop(from, link.id);
                                }}
                            >
                                <Button
                                    block
                                    size="middle"
                                    type={link.primary ? "primary" : "default"}
                                    danger={link.danger}
                                    icon={<HolderOutlined />}
                                    onClick={() => irA(link.href)}
                                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                >
                                    <span>{link.label}</span>
                                    <DeleteOutlined
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveLink(link.id);
                                        }}
                                    />
                                </Button>
                            </div>
                        ))}
                    </Space>

                    <Divider />
                    
                    <div style={{ background: '#fff7e6', padding: 10, borderRadius: 8, border: '1px solid #ffd591' }}>
                        <Text strong style={{ color: '#d46b08' }}>💡 Tip:</Text>
                        <p style={{ marginTop: 4, fontSize: 12, color: '#874d00' }}>
                           Arrastra para reordenar accesos. Usa “+” para agregar uno propio.
                        </p>
                    </div>
                </Card>
            );
        }

        return null;
  };

  if (loading) return <div style={{padding: 50, textAlign: 'center'}}><Spin size="large"/></div>;

    return (
        <div style={{ padding: 8 }}>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div>
                    <Title level={4} style={{ margin: 0 }}>¡Hola, Director! 👋</Title>
                    <Text type="secondary">Todo a la vista sin scroll.</Text>
                </div>
                <Space size={8} wrap>
                    <Text type="secondary" style={{ fontSize: 12 }}>Mostrar</Text>
                    <Switch size="small" checked={cardVisibility.proximos} onChange={(v) => persistVisibility({ ...cardVisibility, proximos: v })} checkedChildren="Próx" unCheckedChildren="Próx" />
                    <Switch size="small" checked={cardVisibility.activos} onChange={(v) => persistVisibility({ ...cardVisibility, activos: v })} checkedChildren="Activos" unCheckedChildren="Activos" />
                    <Switch size="small" checked={cardVisibility.cumple} onChange={(v) => persistVisibility({ ...cardVisibility, cumple: v })} checkedChildren="Cumple" unCheckedChildren="Cumple" />
                    <Switch size="small" checked={cardVisibility.ingresosRecientes} onChange={(v) => persistVisibility({ ...cardVisibility, ingresosRecientes: v })} checkedChildren="Ingresos" unCheckedChildren="Ingresos" />
                    <Switch size="small" checked={cardVisibility.accesos} onChange={(v) => persistVisibility({ ...cardVisibility, accesos: v })} checkedChildren="Accesos" unCheckedChildren="Accesos" />
                </Space>
            </div>

            {/* --- KPIs RÁPIDOS --- */}
            <Row gutter={[6, 6]} style={{ marginBottom: 8 }}>
                {kpiOrder.map((kpiId) => {
                    const commonProps = {
                        size: "small" as const,
                        hoverable: true,
                        style: { cursor: "grab" as const },
                        draggable: true,
                        onDragStart: (e: React.DragEvent) => e.dataTransfer.setData("kpi", kpiId),
                        onDragOver: (e: React.DragEvent) => e.preventDefault(),
                        onDrop: (e: React.DragEvent) => {
                            const from = e.dataTransfer.getData("kpi");
                            handleKpiDrop(from, kpiId);
                        },
                    };

                    if (kpiId === "ingresos") {
                        return (
                            <Col key={kpiId} xs={12} md={8} lg={6}>
                                <Card {...commonProps} onClick={() => irA('/tesoreria')} style={{ ...commonProps.style, background: '#f6ffed', borderColor: '#b7eb8f' }}>
                                    <Statistic 
                                        title={<div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><span>Ingresos</span> <HolderOutlined style={{fontSize:10}}/></div>}
                                        value={stats.ingresosMes}
                                        precision={0}
                                        prefix={<DollarCircleOutlined style={{color: '#52c41a'}}/>}
                                        valueStyle={{ color: '#3f8600', fontWeight: 700 }}
                                        suffix="COP"
                                    />
                                </Card>
                            </Col>
                        );
                    }
                    if (kpiId === "egresos") {
                        return (
                            <Col key={kpiId} xs={12} md={8} lg={6}>
                                <Card {...commonProps} onClick={() => irA('/nomina')} style={{ ...commonProps.style, background: '#fff1f0', borderColor: '#ffa39e' }}>
                                    <Statistic 
                                        title={<div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><span>Nómina</span> <HolderOutlined style={{fontSize:10}}/></div>}
                                        value={stats.egresosMes}
                                        precision={0}
                                        prefix={<FallOutlined style={{color: '#cf1322'}}/>}
                                        valueStyle={{ color: '#cf1322', fontWeight: 700 }}
                                        suffix="COP"
                                    />
                                </Card>
                            </Col>
                        );
                    }
                    if (kpiId === "balance") {
                        return (
                            <Col key={kpiId} xs={12} md={8} lg={6}>
                                <Card {...commonProps} onClick={() => irA('/tesoreria')} style={{ ...commonProps.style, background: '#f0f5ff', borderColor: '#adc6ff' }}>
                                    <Statistic 
                                        title={<div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><span>Balance</span> <HolderOutlined style={{fontSize:10}}/></div>}
                                        value={balanceNeto}
                                        precision={0}
                                        prefix={<WalletOutlined style={{color: '#2f54eb'}}/>}
                                        valueStyle={{ color: balanceNeto >= 0 ? '#1d39c4' : '#cf1322', fontWeight: 700 }}
                                        suffix="COP"
                                    />
                                </Card>
                            </Col>
                        );
                    }
                    if (kpiId === "estudiantes") {
                        return (
                            <Col key={kpiId} xs={12} md={8} lg={6}>
                                <Card {...commonProps} onClick={() => irA('/estudiantes')}>
                                    <Statistic 
                                        title={<div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><span>Estudiantes</span> <HolderOutlined style={{fontSize:10}}/></div>}
                                        value={stats.estudiantesActivos} 
                                        prefix={<UserOutlined style={{color: '#1890ff'}} />} 
                                    />
                                </Card>
                            </Col>
                        );
                    }
                    if (kpiId === "cursos") {
                        return (
                            <Col key={kpiId} xs={12} md={8} lg={6}>
                                <Card {...commonProps} onClick={() => irA('/cursos')}>
                                    <Statistic 
                                        title={<div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><span>Grupos</span> <HolderOutlined style={{fontSize:10}}/></div>}
                                        value={stats.cursosActivos} 
                                        prefix={<BookOutlined style={{color: '#fa8c16'}} />} 
                                    />
                                </Card>
                            </Col>
                        );
                    }
                    if (kpiId === "profesores") {
                        return (
                            <Col key={kpiId} xs={12} md={8} lg={6}>
                                <Card {...commonProps} onClick={() => irA('/profesores')}>
                                    <Statistic 
                                        title={<div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}><span>Profesores</span> <HolderOutlined style={{fontSize:10}}/></div>}
                                        value={stats.profesores} 
                                        prefix={<TeamOutlined style={{color: '#eb2f96'}} />} 
                                    />
                                </Card>
                            </Col>
                        );
                    }
                    return null;
                })}
            </Row>

        {/* --- BLOQUE DE TARJETAS REORDENABLES --- */}
        <Row gutter={[8, 8]}>
            {cardOrder
                .filter((cardId) => {
                    if (cardId === "ingresosRecientes") return cardVisibility.ingresosRecientes;
                    if (cardId === "accesos") return cardVisibility.accesos;
                    if (cardId === "proximos") return cardVisibility.proximos;
                    if (cardId === "activos") return cardVisibility.activos;
                    if (cardId === "cumple") return cardVisibility.cumple;
                    return true;
                })
                .map((cardId) => (
                    <Col key={cardId} xs={24} lg={12}>
                        <div
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("card", cardId)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                const from = e.dataTransfer.getData("card");
                                handleCardDrop(from, cardId);
                            }}
                            style={{ cursor: 'grab' }}
                        >
                            {renderCard(cardId)}
                        </div>
                    </Col>
                ))}
        </Row>

        <Modal
            title="Agregar acceso rápido"
            open={linkModalOpen}
            onCancel={() => { setLinkModalOpen(false); linkForm.resetFields(); }}
            onOk={handleAddLink}
            okText="Agregar"
            cancelText="Cancelar"
        >
            <Form layout="vertical" form={linkForm}>
                <Form.Item name="label" label="Nombre" rules={[{ required: true, message: "Ingresa un nombre" }]}> 
                    <Input maxLength={40} />
                </Form.Item>
                <Form.Item name="href" label="Ruta" rules={[{ required: true, message: "Ingresa la ruta, ej: /cursos" }]}> 
                    <Input placeholder="/cursos" />
                </Form.Item>
            </Form>
        </Modal>
    </div>
  );
}
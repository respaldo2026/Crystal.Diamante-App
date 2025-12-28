"use client";

import React, { useEffect, useMemo, useState } from "react";
import { 
    List, 
    useTable, 
    EditButton, 
    ShowButton, 
    DeleteButton, 
    CreateButton
} from "@refinedev/antd";
import { Table, Space, Tag, Button, Tooltip, Avatar, Input, Card, Row, Col, Tabs, Select, Typography, App, Modal, message } from "antd";
import { 
    WhatsAppOutlined, 
    UserOutlined, 
    MailOutlined,
    PhoneOutlined,
    SearchOutlined,
    IdcardOutlined
} from "@ant-design/icons";
import { enviarWhatsapp } from "@utils/whatsapp";
import { supabaseBrowserClient } from "@utils/supabase/client";
const { Text } = Typography;

export default function EstudiantesList() {
    const { message, modal } = App.useApp();
    const [searchValue, setSearchValue] = useState("");

    const { tableProps, searchFormProps, setFilters } = useTable({
        resource: "perfiles",
        // TRUCO AVANZADO: Traemos las matrículas y el nombre del curso en una sola petición
        meta: {
            select: "*, matriculas(id, estado, cursos(nombre, porcentaje_minimo))"
        },
        sorters: { initial: [{ field: "nombre_completo", order: "asc" }] },
        // Filtro base: Solo estudiantes
        filters: {
            permanent: [
                { field: "rol", operator: "eq", value: "estudiante" }
            ]
        },
        // Lógica del Buscador
        onSearch: (values: any) => {
            const search = values.q;
            if (!search) return [];
            return [
                {
                    field: "nombre_completo",
                    operator: "contains",
                    value: search,
                }
            ];
        }
    });

    // Búsqueda en tiempo real mientras se escribe
    const handleSearchChange = (value: string) => {
        setSearchValue(value);
        if (value) {
            setFilters([
                {
                    field: "nombre_completo",
                    operator: "contains",
                    value,
                }
            ], "replace");
        } else {
            setFilters([], "replace");
        }
    };

    // Tabs: activos, graduados, desertores
    const [activeTab, setActiveTab] = useState<string>('activos');
    const [attFilter, setAttFilter] = useState<'all' | 'bajo' | 'sin'>('all');
    const [asistStats, setAsistStats] = useState<Record<number, { total: number; present: number; porcentaje: number; minimo: number; cumple: boolean; tieneDatos: boolean }>>({});
    const [loadingAsist, setLoadingAsist] = useState(false);
    const activoEstados = ["activo", "en curso"];
    const graduadoEstados = ["aprobado", "certificado", "finalizado"];

    const dataSource = (tableProps.dataSource as any[]) || [];

    // Calcular asistencia por matrícula para cada estudiante
    useEffect(() => {
        const matriculaIds: number[] = [];
        dataSource.forEach((s: any) => {
            (s.matriculas || []).forEach((m: any) => {
                if (m?.id) matriculaIds.push(m.id);
            });
        });
        if (matriculaIds.length === 0) {
            setAsistStats({});
            return;
        }
        const fetchAsist = async () => {
            setLoadingAsist(true);
            try {
                const { data: asistencias } = await supabaseBrowserClient
                    .from('asistencias')
                    .select('matricula_id, estado')
                    .in('matricula_id', matriculaIds);

                const stats: Record<number, any> = {};
                dataSource.forEach((s: any) => {
                    (s.matriculas || []).forEach((m: any) => {
                        const arr = asistencias?.filter(a => a.matricula_id === m.id) || [];
                        const total = arr.length;
                        const present = arr.filter(a => a.estado === 'presente').length;
                        const pct = total > 0 ? (present / total) * 100 : 0;
                        const minimo = m.cursos?.porcentaje_minimo ?? 80;
                        stats[m.id] = {
                            total,
                            present,
                            porcentaje: Math.round(pct),
                            minimo,
                            cumple: pct >= minimo,
                            tieneDatos: total > 0,
                        };
                    });
                });
                setAsistStats(stats);
            } catch (e) {
                console.error('Error calculando asistencia estudiantes:', e);
            } finally {
                setLoadingAsist(false);
            }
        };
        fetchAsist();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dataSource.length]);
    const activos = useMemo(() => dataSource.filter(s => (s.matriculas || []).some((m: any) => activoEstados.includes(String(m.estado || '').toLowerCase()))), [dataSource]);
    const graduados = useMemo(() => dataSource.filter(s => (s.matriculas || []).some((m: any) => graduadoEstados.includes(String(m.estado || '').toLowerCase()))), [dataSource]);
    const desertores = useMemo(() => dataSource.filter(s => (s.matriculas || []).some((m: any) => {
        const st = asistStats[m.id];
        return st && st.tieneDatos && !st.cumple;
    })), [dataSource, asistStats]);

    let filteredDataSource = activeTab === 'activos' ? activos : activeTab === 'graduados' ? graduados : desertores;

    // Apply attendance quick filters
    if (attFilter === 'bajo') {
        filteredDataSource = filteredDataSource.filter((s: any) => {
            const mats = s.matriculas || [];
            let worst: any = null;
            mats.forEach((m: any) => {
                const st = asistStats[m.id];
                if (st && st.tieneDatos) {
                    worst = worst ? (st.porcentaje < worst.porcentaje ? st : worst) : st;
                }
            });
            return worst && !worst.cumple;
        });
    } else if (attFilter === 'sin') {
        filteredDataSource = filteredDataSource.filter((s: any) => {
            const mats = s.matriculas || [];
            const anyDatos = mats.some((m: any) => {
                const st = asistStats[m.id];
                return st && st.tieneDatos;
            });
            return !anyDatos;
        });
    }

    return (
        <List
            title="Estudiantes"
            headerButtons={<CreateButton resource="perfiles" />}
        >
            <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
                { key: 'activos', label: `Activos (${activos.length})` },
                { key: 'graduados', label: `Graduados (${graduados.length})` },
                { key: 'desertores', label: `Desertores (${desertores.length})` },
            ]} />

            {/* --- BARRA DE BÚSQUEDA EN TIEMPO REAL --- */}
            <Card variant="borderless" style={{ marginBottom: 12, background: '#f9f9f9' }}>
                <Input 
                    placeholder="🔍 Buscar por nombre (escribe para filtrar en tiempo real)..." 
                    prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                    allowClear
                    size="large"
                    value={searchValue}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    style={{ width: '100%', maxWidth: '500px' }}
                />
            </Card>

            {/* Quick attendance filters */}
            <Space style={{ marginBottom: 16 }}>
                <Button type={attFilter === 'all' ? 'primary' : 'default'} size="small" onClick={() => setAttFilter('all')}>Todas</Button>
                <Button type={attFilter === 'bajo' ? 'primary' : 'default'} size="small" onClick={() => setAttFilter('bajo')}>Bajo Asistencia</Button>
                <Button type={attFilter === 'sin' ? 'primary' : 'default'} size="small" onClick={() => setAttFilter('sin')}>Sin Asistencia</Button>
            </Space>

            <Table {...tableProps} dataSource={filteredDataSource} rowKey="id" loading={tableProps.loading || loadingAsist}>
                
                {/* 1. Estudiante (Foto + Nombre) */}
                <Table.Column 
                    dataIndex="nombre_completo" 
                    title="Estudiante"
                    render={(value, record: any) => (
                        <Space>
                            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#87d068' }} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, fontSize: '15px' }}>{value || "Sin Nombre"}</span>
                                {/* Badge de asistencia (peor caso entre sus matrículas) */}
                                {(() => {
                                    const mats = record.matriculas || [];
                                    let worst: any = null;
                                    mats.forEach((m: any) => {
                                        const st = asistStats[m.id];
                                        if (st && st.tieneDatos) {
                                            worst = worst ? (st.porcentaje < worst.porcentaje ? st : worst) : st;
                                        }
                                    });
                                    if (!worst) {
                                        return <span style={{ fontSize: '11px', color: '#999' }}>Asist: —</span>;
                                    }
                                    const ok = worst.cumple;
                                    const color = ok ? 'green' : 'red';
                                    return (
                                        <Tooltip title={`Presentes: ${worst.present}/${worst.total} · Mínimo: ${worst.minimo}%`}>
                                            <Tag color={color} style={{ marginTop: 4, width: 'fit-content' }}>
                                                Asist: {worst.porcentaje}%
                                            </Tag>
                                        </Tooltip>
                                    );
                                })()}
                                {/* ID de referencia rápida */}
                                <span style={{ fontSize: '11px', color: '#999' }}>ID: {record.identificacion || 'N/A'}</span>
                            </div>
                        </Space>
                    )}
                />

                {/* 2. Identificación (Columna Dedicada) */}
                <Table.Column 
                    dataIndex="identificacion" 
                    title="Identificación"
                    render={(value) => (
                        <div style={{ color: '#555' }}>
                            <IdcardOutlined style={{ marginRight: 6 }} />
                            {value ? <span style={{ fontWeight: 500 }}>{value}</span> : <span style={{color:'#ccc'}}>--</span>}
                        </div>
                    )}
                />

                {/* 3. Cursos Inscritos (¡NUEVO!) */}
                <Table.Column 
                    title="Cursos Activos"
                    render={(_, record: any) => {
                        // Filtramos solo matrículas activas o recientes
                        const matriculas = record.matriculas || [];
                        if (matriculas.length === 0) return <Tag>Ninguno</Tag>;

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {matriculas.map((mat: any, index: number) => {
                                    const nombreCurso = mat.cursos?.nombre || "Curso sin nombre";
                                    const estadoRaw = mat.estado || "";
                                    const estado = (typeof estadoRaw === "string" ? estadoRaw.toLowerCase() : estadoRaw);
                                    const color = estado === 'activo' ? 'blue' : estado === 'finalizado' ? 'green' : 'default';
                                    return (
                                        <Tag key={index} color={color} style={{ margin: 0 }}>
                                            {nombreCurso}
                                        </Tag>
                                    );
                                })}
                            </div>
                        );
                    }}
                />

                {/* 4. Contacto */}
                <Table.Column 
                    title="Contacto"
                    width={200}
                    render={(_, record: any) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {record.telefono && (
                                <Tag icon={<PhoneOutlined />} color="geekblue" style={{ border: 'none', background: 'transparent', padding: 0, color: '#1d39c4' }}>
                                    {record.telefono}
                                </Tag>
                            )}
                            {record.email && (
                                <span style={{ fontSize: '12px', color: '#888' }}>
                                    <MailOutlined style={{ marginRight: 4 }} />
                                    {record.email}
                                </span>
                            )}
                        </div>
                    )}
                />

                {/* 5. Acciones */}
                <Table.Column 
                    title="Acciones"
                    fixed="right"
                    width={180}
                    render={(_, record: any) => (
                        <Space>
                            <Tooltip title="Enviar WhatsApp">
                                <Button 
                                    shape="circle"
                                    icon={<WhatsAppOutlined />} 
                                    style={{ 
                                        backgroundColor: '#f6ffed', 
                                        borderColor: '#b7eb8f', 
                                        color: '#389e0d' 
                                    }}
                                    onClick={() => {
                                        const msg = `Hola ${record.nombre_completo}, te contactamos de la Academia...`;
                                        enviarWhatsapp(record.telefono, msg);
                                    }}
                                />
                            </Tooltip>

                            <ShowButton hideText size="small" resource="perfiles" recordItemId={record.id} />
                            <EditButton hideText size="small" resource="perfiles" recordItemId={record.id} />
                            <Button 
                                size="small" 
                                danger
                                onClick={() => handleArchivarEstudiante(record)}
                            >
                                Archivar
                            </Button>
                        </Space>
                    )}
                />
            </Table>
        </List>
    );
}

async function archivableCheck(estudianteId: string) {
    const { data: mats, error } = await supabaseBrowserClient
        .from("matriculas")
        .select("id, estado, cursos(nombre)")
        .eq("estudiante_id", estudianteId);
    if (error) throw error;
    return mats || [];
}

function handleArchivarEstudiante(record: any) {
    const estudianteId = record.id;
    archivableCheck(estudianteId)
        .then((matriculas) => {
            const activas = (matriculas || []).filter((m: any) => String(m.estado || '').toLowerCase() === 'activo');
            if (activas.length > 0) {
                Modal.warning({
                    title: "No se puede eliminar el estudiante",
                    content: (
                        <div>
                            <p>Este perfil está vinculado a <strong>{activas.length} matrícula(s) activa(s)</strong>. Para retirar correctamente:</p>
                            <ol>
                                <li>Abre Gestionar del curso y marca la matrícula como retirada o cancelada</li>
                                <li>El estudiante quedará fuera del curso, preservando el historial</li>
                                <li>Luego puedes archivar el perfil para ocultarlo de la lista</li>
                            </ol>
                            <p><strong>Matrículas activas:</strong></p>
                            <ul>
                                {activas.slice(0,5).map((m: any) => (
                                    <li key={m.id}>{m.cursos?.nombre || 'Curso'}</li>
                                ))}
                                {activas.length > 5 && <li>... y {activas.length - 5} más</li>}
                            </ul>
                        </div>
                    ),
                    okText: "Entendido"
                });
                return;
            }
            
            // Archivar perfil cambiando rol para que no aparezca en la lista
            Modal.confirm({
                title: "¿Archivar este estudiante?",
                content: (
                    <div>
                        <p>Archivar oculta al estudiante de la lista, conserva todo el historial y no elimina datos.</p>
                        <ul>
                            <li>Desaparece de la pestaña de Estudiantes activos</li>
                            <li>No será elegible para nuevas matrículas</li>
                            <li>Podrás reactivarlo cambiando su rol nuevamente a estudiante</li>
                        </ul>
                    </div>
                ),
                okText: "Sí, archivar",
                okType: "default",
                cancelText: "Cancelar",
                onOk: async () => {
                    const { error } = await supabaseBrowserClient
                        .from("perfiles")
                        .update({ rol: "estudiante_inactivo" })
                        .eq("id", estudianteId);
                    if (error) {
                        message.error("Error al archivar: " + (error.message || 'Desconocido'));
                        return;
                    }
                    message.success("Estudiante archivado correctamente");
                }
            });
        })
        .catch((err) => {
            console.error('Error validando matrículas:', err);
            message.error('No se pudo validar el estado del estudiante');
        });
}
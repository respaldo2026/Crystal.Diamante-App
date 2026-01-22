"use client";

import React, { useEffect, useMemo, useState } from "react";
import { 
    List, 
    useTable, 
    EditButton, 
    ShowButton, 
    CreateButton
} from "@refinedev/antd";
import { Table, Space, Tag, Button, Tooltip, Avatar, Input, Card, Row, Col, Tabs, Select, Typography, App, message } from "antd";
import { 
    WhatsAppOutlined, 
    UserOutlined, 
    MailOutlined,
    PhoneOutlined,
    SearchOutlined,
    IdcardOutlined,
    DeleteOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { enviarWhatsapp } from "@utils/whatsapp";
import { supabaseBrowserClient } from "@utils/supabase/client";
const { Text } = Typography;

export default function EstudiantesList() {
    const router = useRouter();
    const { message: antMessage, modal } = App.useApp();
    const { user } = useCurrentUser();
    const [searchValue, setSearchValue] = useState("");
    
    // Construcción dinámica de filtros según rol
    const permanentFilters = () => {
        const filters: any[] = [
            { field: "rol", operator: "eq", value: "estudiante" }
            // Removido el filtro de activo para mostrar todos
        ];
        
        // Si es profesor, solo ve estudiantes de sus cursos
        if (user?.rol === "profesor") {
            filters.push({ field: "perfiles.profesor_id", operator: "eq", value: user.id });
        }
        
        return filters;
    };

    const { tableProps, setFilters } = useTable({
        resource: "perfiles",
        // TRUCO AVANZADO: Especificar explícitamente la FK para evitar ambigüedad
        meta: {
            select: "*, matriculas!matriculas_estudiante_id_fkey(id, estado, cursos(nombre, porcentaje_minimo))"
        },
        sorters: { initial: [{ field: "nombre_completo", order: "asc" }] },
        pagination: {
            current: 1,
            pageSize: 50 // Limitar a 50 por página para mejor rendimiento
        },
        // Filtro base: Solo estudiantes
        filters: {
            permanent: permanentFilters()
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
    const [calcularAsistencia, setCalcularAsistencia] = useState(false);
    const activoEstados = ["activo", "en curso", "pendiente"];
    const graduadoEstados = ["aprobado", "certificado", "finalizado"];

    const dataSource = (tableProps.dataSource as any[]) || [];

    // Calcular asistencia por matrícula para cada estudiante (SOLO cuando se solicite)
    useEffect(() => {
        if (!calcularAsistencia) return;
        
        const matriculaIds: number[] = [];
        dataSource.forEach((s: any) => {
            (s.matriculas || []).forEach((m: any) => {
                if (m?.id) matriculaIds.push(m.id);
            });
        });
        if (matriculaIds.length === 0) {
            setAsistStats({});
            setLoadingAsist(false);
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
    }, [calcularAsistencia, dataSource.length]);
    const activos = useMemo(() => dataSource.filter(s => {
        // Mostrar todos los estudiantes que tienen activo=true O no tienen el campo
        // Si tienen matrículas, verificar que al menos una esté activa
        const mats = s.matriculas || [];
        if (mats.length === 0) return s.activo !== false; // Estudiantes sin matrícula (activos por defecto)
        return mats.some((m: any) => activoEstados.includes(String(m.estado || '').toLowerCase()));
    }), [dataSource]);
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
                    width={200}
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
                            
                            <Tooltip title={user?.rol === "admin" ? "Eliminar estudiante (borrado en cascada automático)" : "Solo admin puede eliminar"}>
                                <Button 
                                    danger
                                    type="text"
                                    size="small"
                                    disabled={user?.rol !== "admin"}
                                    onClick={() => confirmarEliminarEstudiante(record, antMessage, modal, router)}
                                    icon={<DeleteOutlined />}
                                />
                            </Tooltip>
                            
                            <Button 
                                size="small" 
                                danger
                                onClick={() => handleArchivarEstudiante(record, antMessage, modal, router)}
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

async function handleEliminarEstudiante(record: any, msg: any, modalInstance: any, router: any) {
    const estudianteId = record.id;
    
    // Primero, eliminar todas las relaciones de forma segura
    try {
        // 1. Eliminar asistencias relacionadas con matrículas del estudiante
        const { data: matriculas } = await supabaseBrowserClient
            .from("matriculas")
            .select("id")
            .eq("estudiante_id", estudianteId);
        
        if (matriculas && matriculas.length > 0) {
            const matriculaIds = matriculas.map(m => m.id);
            
            // Eliminar asistencias
            await supabaseBrowserClient
                .from("asistencias")
                .delete()
                .in("matricula_id", matriculaIds);
            
            // Eliminar calificaciones
            await supabaseBrowserClient
                .from("calificaciones")
                .delete()
                .in("matricula_id", matriculaIds);
            
            // Eliminar pagos de matrículas
            await supabaseBrowserClient
                .from("pagos")
                .delete()
                .in("matricula_id", matriculaIds);
        }
        
        // 2. Eliminar pagos directos del estudiante
        await supabaseBrowserClient
            .from("pagos")
            .delete()
            .eq("estudiante_id", estudianteId);
        
        // 3. Eliminar matrículas
        await supabaseBrowserClient
            .from("matriculas")
            .delete()
            .eq("estudiante_id", estudianteId);
        
        // 4. Finalmente eliminar el perfil
        const { error } = await supabaseBrowserClient
            .from("perfiles")
            .delete()
            .eq("id", estudianteId);
        
        if (error) {
            console.error('Error al eliminar perfil:', error);
            msg.error("Error al eliminar: " + (error.message || 'Desconocido'));
            return;
        }
        
        msg.success("✅ Estudiante y todos sus datos eliminados correctamente");
        router.refresh();
        
    } catch (err: any) {
        console.error('Error inesperado:', err);
        msg.error('Error inesperado: ' + (err?.message || 'Desconocido'));
    }
}

function confirmarEliminarEstudiante(record: any, msg: any, modalInstance: any, router: any) {
    const estudianteId = record.id;
    
    // Usar el modal desde el contexto de App correctamente
    modalInstance.confirm({
        title: "¿Eliminar este estudiante?",
        width: 600,
        content: (
            <div>
                <p>Estás a punto de eliminar permanentemente a:</p>
                <p><strong>{record.nombre_completo}</strong></p>
                <p>ID: {record.identificacion || 'N/A'}</p>
                <div style={{ marginTop: 16, padding: 12, background: '#fff0f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
                    <strong>⚠️ Esta acción eliminará automáticamente:</strong>
                    <ul style={{ margin: '8px 0 0 0' }}>
                        <li>✋ Todas sus matrículas</li>
                        <li>💰 Todos sus pagos</li>
                        <li>📊 Todos sus registros de asistencia</li>
                        <li>📝 Todas sus calificaciones</li>
                        <li>🔔 Todas sus notificaciones</li>
                        <li>👤 Su perfil completo</li>
                    </ul>
                    <p style={{ marginTop: 8, marginBottom: 0, fontWeight: 'bold', color: '#cf1322' }}>
                        Esta operación es PERMANENTE e IRREVERSIBLE.
                    </p>
                </div>
                <div style={{ marginTop: 12, padding: 10, background: '#e6f7ff', border: '1px solid #91d5ff', borderRadius: 4 }}>
                    <strong>💡 Alternativa recomendada:</strong>
                    <p style={{ margin: '4px 0 0 0' }}>Usa el botón <strong>"Archivar"</strong> para ocultar al estudiante sin perder su historial.</p>
                </div>
            </div>
        ),
        okText: "Sí, ELIMINAR PERMANENTEMENTE",
        okType: "danger",
        cancelText: "Cancelar",
        onOk: async () => {
            await handleEliminarEstudiante(record, msg, modalInstance, router);
        }
    });
}

function handleArchivarEstudiante(record: any, msg: any, modalInstance: any, router: any) {
    const estudianteId = record.id;
    
    modalInstance.confirm({
        title: "¿Archivar este estudiante?",
        content: (
            <div>
                <p><strong>{record.nombre_completo}</strong> será archivado (marcado como inactivo).</p>
                <p>El estudiante desaparecerá de la lista pero sus datos se conservan:</p>
                <ul>
                    <li>✓ Historial de matrículas y calificaciones se mantiene</li>
                    <li>✓ Registros de pagos intactos</li>
                    <li>✓ Datos históricos para auditoría</li>
                </ul>
                <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4 }}>
                    <strong>ℹ️ Nota:</strong> No aparecerá en el dropdown de selección de estudiantes para nuevos pagos.
                </div>
            </div>
        ),
        okText: "Sí, archivar",
        okType: "default",
        cancelText: "Cancelar",
        onOk: async () => {
            try {
                const { error } = await supabaseBrowserClient
                    .from("perfiles")
                    .update({ 
                        activo: false,
                        fecha_baja: new Date().toISOString()
                    })
                    .eq("id", estudianteId);
                
                if (error) {
                    msg.error("Error al archivar: " + (error.message || 'Desconocido'));
                    return;
                }
                
                msg.success("Estudiante archivado correctamente");
                router.refresh();
            } catch (err: any) {
                msg.error(err?.message || "Error al archivar estudiante");
            }
        }
    });
}
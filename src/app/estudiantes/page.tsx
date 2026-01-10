"use client";

import React, { useEffect, useMemo, useState } from "react";
import { 
    List, 
    useTable, 
    EditButton, 
    ShowButton, 
    CreateButton
} from "@refinedev/antd";
import { Table, Space, Tag, Button, Tooltip, Avatar, Input, Card, Row, Col, Tabs, Select, Typography, App, Modal, message } from "antd";
import { 
    WhatsAppOutlined, 
    UserOutlined, 
    MailOutlined,
    PhoneOutlined,
    SearchOutlined,
    IdcardOutlined,
    DeleteOutlined
} from "@ant-design/icons";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { enviarWhatsapp } from "@utils/whatsapp";
import { supabaseBrowserClient } from "@utils/supabase/client";
const { Text } = Typography;

export default function EstudiantesList() {
    const { message: antMessage } = App.useApp();
    const { user } = useCurrentUser();
    const [searchValue, setSearchValue] = useState("");
    
    // Debug: Verificar que el usuario está siendo cargado
    useEffect(() => {
        console.log("Usuario actual:", user);
        console.log("Usuario rol:", user?.rol);
        console.log("Es admin?", user?.rol === "admin");
    }, [user]);

    // Construcción dinámica de filtros según rol
    const permanentFilters = () => {
        const filters: any[] = [
            { field: "rol", operator: "eq", value: "estudiante" }
        ];
        
        // Si es profesor, solo ve estudiantes de sus cursos
        if (user?.rol === "profesor") {
            filters.push({ field: "perfiles.profesor_id", operator: "eq", value: user.id });
        }
        
        return filters;
    };

    const { tableProps, searchFormProps, setFilters } = useTable({
        resource: "perfiles",
        // TRUCO AVANZADO: Traemos las matrículas y el nombre del curso en una sola petición
        meta: {
            select: "*, matriculas(id, estado, cursos(nombre, porcentaje_minimo))"
        },
        sorters: { initial: [{ field: "nombre_completo", order: "asc" }] },
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
    const activos = useMemo(() => dataSource.filter(s => {
        const mats = s.matriculas || [];
        if (mats.length === 0) return true; // mostrar estudiantes sin matrícula aún
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
                            
                            <Tooltip title={user?.rol === "admin" ? "Eliminar estudiante - Primero borra pagos en Tesorería" : "Solo admin puede eliminar"}>
                                <Button 
                                    danger
                                    type="text"
                                    size="small"
                                    disabled={user?.rol !== "admin"}
                                    onClick={() => handleEliminarEstudiante(record, antMessage)}
                                    icon={<DeleteOutlined />}
                                />
                            </Tooltip>
                            
                            <Button 
                                size="small" 
                                danger
                                onClick={() => handleArchivarEstudiante(record, antMessage)}
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

async function checkDatosRelacionados(estudianteId: string) {
    // Primero obtener las matrículas
    const matriculasResp = await supabaseBrowserClient
        .from("matriculas")
        .select("id, cursos(nombre)")
        .eq("estudiante_id", estudianteId);
    
    const matriculaIds = matriculasResp.data?.map((m: any) => m.id) || [];

    // Luego verificar pagos (directos e indirectos)
    const [pagosEstudiante, pagosMatriculas, asistencias] = await Promise.all([
        supabaseBrowserClient
            .from("pagos")
            .select("id, monto, matricula_id, estudiante_id")
            .eq("estudiante_id", estudianteId),
        matriculaIds.length > 0
            ? supabaseBrowserClient
                .from("pagos")
                .select("id, monto, matricula_id, estudiante_id")
                .in("matricula_id", matriculaIds)
            : Promise.resolve({ data: [], error: null }),
        matriculaIds.length > 0
            ? supabaseBrowserClient
                .from("asistencias")
                .select("id")
                .in("matricula_id", matriculaIds)
            : Promise.resolve({ data: [], error: null })
    ]);

    // Combinar todos los pagos encontrados (sin duplicados)
    const pagosMap = new Map();
    [...(pagosEstudiante.data || []), ...(pagosMatriculas.data || [])].forEach((pago: any) => {
        if (pago.id && !pagosMap.has(pago.id)) {
            pagosMap.set(pago.id, pago);
        }
    });
    const todosPagos = Array.from(pagosMap.values());

    return {
        matriculas: matriculasResp.data || [],
        pagos: todosPagos,
        asistencias: asistencias.data || [],
        tieneDatos: (matriculasResp.data?.length || 0) > 0 || 
                    (todosPagos.length) > 0 || 
                    (asistencias.data?.length || 0) > 0
    };
}

function handleEliminarEstudiante(record: any, msg: any) {
    const estudianteId = record.id;
    
    // Verificar datos relacionados antes de intentar eliminar
    checkDatosRelacionados(estudianteId)
        .then((datos) => {
            console.log("Datos relacionados encontrados:", datos);
            
            // Si hay pagos, mostrar opción para admin de borrarlos
            if (datos.pagos.length > 0) {
                Modal.confirm({
                    title: "Este estudiante tiene pagos registrados",
                    width: 600,
                    content: (
                        <div>
                            <p><strong>{record.nombre_completo}</strong> tiene <strong>{datos.pagos.length} registro(s) de pagos</strong>.</p>
                            <div style={{ marginTop: 16, padding: 12, background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4 }}>
                                <strong>📋 Opciones:</strong>
                                <ul style={{ margin: '8px 0 0 0' }}>
                                    <li><strong>Admin:</strong> Puedes eliminar los pagos en Tesorería y luego borrar el estudiante</li>
                                    <li><strong>Todos:</strong> Usa &quot;Archivar&quot; para ocultar sin eliminar datos</li>
                                </ul>
                            </div>
                        </div>
                    ),
                    okText: "Eliminar pagos ahora",
                    okType: "primary",
                    cancelText: "Ir a Tesorería",
                    onOk: async () => {
                        try {
                            // Intenta eliminar de ambas formas: directa e indirecta
                            const matriculaIds = datos.matriculas.map((m: any) => m.id);
                            
                            // 1. Eliminar pagos asociados directamente al estudiante
                            const { error: errorDirecto } = await supabaseBrowserClient
                                .from("pagos")
                                .delete()
                                .eq("estudiante_id", estudianteId);

                            // 2. Eliminar pagos asociados indirectamente (a través de matrículas)
                            let errorIndirecto = null;
                            if (matriculaIds.length > 0) {
                                const result = await supabaseBrowserClient
                                    .from("pagos")
                                    .delete()
                                    .in("matricula_id", matriculaIds);
                                errorIndirecto = result.error;
                            }

                            if (errorDirecto || errorIndirecto) {
                                const errorMsg = errorDirecto?.message || errorIndirecto?.message;
                                msg.error("Hubo un problema al limpiar los pagos: " + errorMsg);
                                return;
                            }

                            msg.success("Pagos eliminados correctamente. Ahora borrando estudiante...");
                            
                            // Reintentar eliminación después de limpiar pagos
                            setTimeout(() => {
                                handleEliminarEstudiante(record, msg);
                            }, 500);
                        } catch (e: any) {
                            msg.error(e?.message || "Error al eliminar pagos");
                        }
                    },
                    onCancel: () => {
                        window.location.href = "/tesoreria";
                    }
                });
                return;
            }

            // Si tiene matrículas o asistencias, ofrecer borrar todo en cascada (solo admin)
            if (datos.matriculas.length > 0 || datos.asistencias.length > 0) {
                const tieneMatriculas = datos.matriculas.length > 0;
                const tieneAsistencias = datos.asistencias.length > 0;
                
                Modal.confirm({
                    title: "¿Eliminar estudiante y todo su historial?",
                    width: 600,
                    content: (
                        <div>
                            <p><strong>{record.nombre_completo}</strong> tiene datos relacionados que serán eliminados:</p>
                            <ul>
                                {tieneMatriculas && (
                                    <li><strong>{datos.matriculas.length} matrícula(s)</strong>
                                        <ul>
                                            {datos.matriculas.slice(0, 3).map((m: any) => (
                                                <li key={m.id}>{m.cursos?.nombre || 'Curso'}</li>
                                            ))}
                                            {datos.matriculas.length > 3 && <li>... y {datos.matriculas.length - 3} más</li>}
                                        </ul>
                                    </li>
                                )}
                                {tieneAsistencias && (
                                    <li><strong>{datos.asistencias.length} registro(s) de asistencia</strong></li>
                                )}
                            </ul>
                            <div style={{ marginTop: 16, padding: 12, background: '#fff0f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
                                <strong>⚠️ Advertencia:</strong>
                                <p style={{ margin: '8px 0 0 0' }}>Esta acción es <strong>permanente e irreversible</strong>. Se eliminarán:</p>
                                <ul style={{ marginBottom: 0 }}>
                                    <li>✋ Todas las matrículas</li>
                                    <li>📊 Todos los registros de asistencia</li>
                                    <li>👤 El perfil del estudiante completo</li>
                                </ul>
                            </div>
                        </div>
                    ),
                    okText: "Sí, eliminar PERMANENTEMENTE",
                    okType: "danger",
                    cancelText: "Cancelar",
                    onOk: async () => {
                        try {
                            await eliminarEstudianteEnCascada(estudianteId, datos);
                            msg.success("Estudiante y todo su historial eliminados correctamente");
                            setTimeout(() => window.location.reload(), 1000);
                        } catch (err: any) {
                            console.error('Error al eliminar:', err);
                            msg.error("Error: " + (err?.message || 'No se pudo eliminar'));
                        }
                    }
                });
                return;
            }
            
            // No tiene datos relacionados, se puede eliminar directamente
            Modal.confirm({
                title: "¿Eliminar este estudiante?",
                content: (
                    <div>
                        <p>Estás a punto de eliminar permanentemente a:</p>
                        <p><strong>{record.nombre_completo}</strong></p>
                        <p>ID: {record.identificacion || 'N/A'}</p>
                        <div style={{ marginTop: 16, padding: 12, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4 }}>
                            <strong>⚠️ Advertencia:</strong>
                            <p style={{ margin: '8px 0 0 0' }}>Esta acción es <strong>permanente</strong> y no se puede deshacer. Solo elimina si el estudiante fue creado por error.</p>
                        </div>
                    </div>
                ),
                okText: "Sí, eliminar permanentemente",
                okType: "danger",
                cancelText: "Cancelar",
                onOk: async () => {
                    try {
                        const { error } = await supabaseBrowserClient
                            .from("perfiles")
                            .delete()
                            .eq("id", estudianteId);
                        
                        if (error) {
                            console.error('Error al eliminar:', error);
                            msg.error("Error al eliminar: " + (error.message || 'Desconocido'));
                            return;
                        }
                        
                        msg.success("Estudiante eliminado correctamente");
                        setTimeout(() => window.location.reload(), 1000);
                    } catch (err) {
                        console.error('Error inesperado:', err);
                        msg.error('Error inesperado al eliminar el estudiante');
                    }
                }
            });
        })
        .catch((err) => {
            console.error('Error verificando datos relacionados:', err);
            msg.error('No se pudo verificar el estado del estudiante');
        });
}

async function eliminarEstudianteEnCascada(estudianteId: string, datos: any) {
    // Eliminar en orden: asistencias → matrículas → estudiante
    
    // 1. Eliminar asistencias
    if (datos.asistencias.length > 0) {
        const asistenciaIds = datos.asistencias.map((a: any) => a.id);
        const { error: errAsist } = await supabaseBrowserClient
            .from("asistencias")
            .delete()
            .in("id", asistenciaIds);
        if (errAsist) throw errAsist;
    }
    
    // 2. Eliminar matrículas
    if (datos.matriculas.length > 0) {
        const matriculaIds = datos.matriculas.map((m: any) => m.id);
        const { error: errMat } = await supabaseBrowserClient
            .from("matriculas")
            .delete()
            .in("id", matriculaIds);
        if (errMat) throw errMat;
    }
    
    // 3. Eliminar estudiante
    const { error: errPerf } = await supabaseBrowserClient
        .from("perfiles")
        .delete()
        .eq("id", estudianteId);
    if (errPerf) throw errPerf;
}

function handleArchivarEstudiante(record: any, msg: any) {
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
                        msg.error("Error al archivar: " + (error.message || 'Desconocido'));
                        return;
                    }
                    msg.success("Estudiante archivado correctamente");
                    // Recargar la página para reflejar los cambios
                    setTimeout(() => window.location.reload(), 1000);
                }
            });
        })
        .catch((err) => {
            console.error('Error validando matrículas:', err);
            msg.error('No se pudo validar el estado del estudiante');
        });
}
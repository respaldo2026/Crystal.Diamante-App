"use client";

import React, { useState } from "react";
import { 
    List, 
    useTable, 
    EditButton, 
    ShowButton, 
    DeleteButton, 
    CreateButton
} from "@refinedev/antd";
import { Table, Space, Tag, Button, Tooltip, Avatar, Form, Input, Card, Row, Col } from "antd";
import { 
    WhatsAppOutlined, 
    UserOutlined, 
    MailOutlined,
    PhoneOutlined,
    SearchOutlined,
    IdcardOutlined
} from "@ant-design/icons";
import { enviarWhatsapp } from "@utils/whatsapp";

export default function EstudiantesList() {
    const [searchValue, setSearchValue] = useState("");

    const { tableProps, searchFormProps, setFilters } = useTable({
        resource: "perfiles",
        // TRUCO AVANZADO: Traemos las matrículas y el nombre del curso en una sola petición
        meta: {
            select: "*, matriculas(estado, cursos(nombre))"
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

    return (
        <List
            title="Listado de Estudiantes"
            headerButtons={<CreateButton resource="estudiantes" />}
        >
            {/* --- BARRA DE BÚSQUEDA EN TIEMPO REAL --- */}
            <Card variant="borderless" style={{ marginBottom: 20, background: '#f9f9f9' }}>
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

            <Table {...tableProps} rowKey="id">
                
                {/* 1. Estudiante (Foto + Nombre) */}
                <Table.Column 
                    dataIndex="nombre_completo" 
                    title="Estudiante"
                    render={(value, record: any) => (
                        <Space>
                            <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#87d068' }} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600, fontSize: '15px' }}>{value || "Sin Nombre"}</span>
                                {/* Mostramos el ID pequeño debajo del nombre también, para referencia rápida */}
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

                            <ShowButton hideText size="small" resource="estudiantes" recordItemId={record.id} />
                            <EditButton hideText size="small" resource="estudiantes" recordItemId={record.id} />
                            <DeleteButton hideText size="small" resource="estudiantes" recordItemId={record.id} />
                        </Space>
                    )}
                />
            </Table>
        </List>
    );
}
"use client";

import React from "react";
import { List, useTable, EditButton, DeleteButton, useSelect } from "@refinedev/antd";
import { Table, Space, Tag, Avatar, Typography } from "antd";
import { UserOutlined, BookOutlined, CalendarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

const { Text } = Typography;

export default function ListMatriculas() {
  const { tableProps } = useTable({
    resource: "matriculas",
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  // 1. Traer nombres de Estudiantes
  const { selectProps: studentSelect } = useSelect({
    resource: "perfiles",
    optionLabel: "nombre_completo",
    optionValue: "id",
  });

  // 2. Traer nombres de Cursos
  const { selectProps: cursoSelect } = useSelect({
    resource: "cursos",
    optionLabel: "nombre",
    optionValue: "id",
  });

  // Helpers para mostrar nombres
  const getEstudiante = (id: string) => studentSelect.options?.find((o) => o.value === id)?.label || "Cargando...";
  const getCurso = (id: string) => cursoSelect.options?.find((o) => o.value === id)?.label || "Cargando...";

  return (
    <List title="Gestión de Matrículas">
      <Table {...tableProps} rowKey="id">
        
        {/* COLUMNA ESTUDIANTE */}
        <Table.Column 
            title="Estudiante" 
            dataIndex="estudiante_id"
            render={(id) => (
                <Space>
                    <Avatar icon={<UserOutlined />} style={{ backgroundColor: '#722ed1' }} />
                    <Text strong>{getEstudiante(id)}</Text>
                </Space>
            )}
        />

        {/* COLUMNA CURSO */}
        <Table.Column 
            title="Curso Inscrito" 
            dataIndex="curso_id"
            render={(id) => (
                <Tag icon={<BookOutlined />} color="blue">
                    {getCurso(id)}
                </Tag>
            )}
        />

        {/* COLUMNA FECHA */}
        <Table.Column 
            title="Inicio" 
            dataIndex="fecha_inicio"
            render={(val) => <><CalendarOutlined /> {dayjs(val).format("DD/MM/YYYY")}</>}
        />

        {/* COLUMNA ESTADO */}
        <Table.Column 
            title="Estado" 
            dataIndex="estado"
            render={(val) => {
                const colors: any = { activo: 'green', suspendido: 'orange', finalizado: 'blue', retirado: 'red' };
                return <Tag color={colors[val]}>{val?.toUpperCase()}</Tag>;
            }}
        />

        {/* ACCIONES */}
        <Table.Column
          title="Acciones"
          dataIndex="actions"
          render={(_, record: any) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}
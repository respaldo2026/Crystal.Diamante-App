"use client";

import React from "react";
import { 
  List, 
  useTable, 
  EditButton, 
  DeleteButton 
} from "@refinedev/antd";
import { 
  Table, 
  Space, 
  Tag, 
  Form, 
  Input, 
  Button, 
  Card,
  Row,
  Col
} from "antd";
import { SearchOutlined } from "@ant-design/icons";

export default function ListMatriculas() {
  const { tableProps, searchFormProps } = useTable({
    resource: "matriculas",
    // 1. Mantenemos el truco del "Francotirador" para que cargue los datos bien
    meta: {
      select: "*, perfiles!fk_matriculas_perfiles_v2(nombre_completo), cursos!fk_matriculas_cursos_v2(nombre)",
    },
    // 2. Aquí configuramos el filtro
    onSearch: (params: any) => {
      const filters: any = [];
      const { q } = params; // 'q' es lo que escribes en el buscador

      if (q) {
        filters.push({
          field: "perfiles.nombre_completo", // Buscamos en el nombre del estudiante
          operator: "contains", // Que "contenga" el texto
          value: q,
        });
      }

      return filters;
    },
  });

  return (
    <List>
      
      {/* --- BARRA DE BÚSQUEDA --- */}
      <Card bordered={false} style={{ marginBottom: 20 }}>
        <Form {...searchFormProps} layout="inline">
          <Form.Item name="q" style={{ width: '300px' }}>
            <Input 
              placeholder="Buscar por nombre de estudiante..." 
              prefix={<SearchOutlined />} 
              allowClear
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              Buscar
            </Button>
          </Form.Item>
        </Form>
      </Card>
      {/* ------------------------- */}

      <Table {...tableProps} rowKey="id">
        
        <Table.Column dataIndex="id" title="ID" width={50} />

        {/* Estudiante */}
        <Table.Column
          title="Estudiante"
          dataIndex={["perfiles", "nombre_completo"]} 
          render={(value) => <b>{value || "---"}</b>} 
        />

        {/* Curso */}
        <Table.Column
          title="Curso"
          dataIndex={["cursos", "nombre"]} 
          render={(value) => <Tag color="blue">{value || "---"}</Tag>}
        />

        <Table.Column 
            dataIndex="monto_pagado" 
            title="Monto" 
            render={(value) => `$ ${Number(value).toLocaleString()}`} 
        />

        <Table.Column 
            dataIndex="fecha_inicio" 
            title="Fecha Inicio" 
        />

        <Table.Column 
            dataIndex="estado" 
            title="Estado"
            render={(value) => {
                let color = "default";
                if (value === "activo") color = "green";
                if (value === "suspendido") color = "red";
                if (value === "finalizado") color = "gold";
                return <Tag color={color}>{value?.toUpperCase() || "ACTIVO"}</Tag>
            }}
        />

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
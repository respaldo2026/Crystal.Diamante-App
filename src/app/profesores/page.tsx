"use client";

import React from "react";
import { List, useTable, EditButton, ShowButton } from "@refinedev/antd";
import { Table, Space, Avatar, Tag } from "antd";
import { UserOutlined } from "@ant-design/icons";

export default function ListProfesores() {
  // TRUCO: Resource "perfiles" (la tabla real), pero filtramos por rol
  const { tableProps } = useTable({
    resource: "perfiles", 
    filters: {
      permanent: [{ field: "rol", operator: "eq", value: "profesor" }],
    },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  return (
    <List title="Plana Docente">
      <Table {...tableProps} rowKey="id">
        <Table.Column 
            title="Docente"
            dataIndex="nombre_completo"
            render={(value) => (
                <Space>
                    <Avatar style={{ backgroundColor: '#722ed1' }} icon={<UserOutlined />} />
                    <b>{value}</b>
                </Space>
            )}
        />
        <Table.Column dataIndex="identificacion" title="Cédula" />
        <Table.Column dataIndex="telefono" title="Teléfono" />
        <Table.Column 
            title="Forma de Pago" 
            dataIndex="tipo_pago"
            render={(val, record: any) => {
                const monto = Number(record.valor_pago || 0).toLocaleString();
                if (val === 'fijo_mensual') return <Tag color="blue">📅 Fijo: $ {monto}</Tag>;
                if (val === 'valor_hora') return <Tag color="cyan">⏱️ Hora: $ {monto}</Tag>;
                return <Tag color="purple">% Comisión: {record.valor_pago}%</Tag>;
            }}
        />
        <Table.Column
          title="Acciones"
          dataIndex="actions"
          render={(_, record: any) => (
            <Space>
              {/* Apunta a /profesores/show/ID */}
              <ShowButton hideText size="small" recordItemId={record.id} resource="profesores" />
              {/* Apunta a /profesores/edit/ID */}
              <EditButton hideText size="small" recordItemId={record.id} resource="profesores" />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}
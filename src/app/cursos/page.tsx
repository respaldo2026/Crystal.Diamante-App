"use client";

import React from "react";
import { List, useTable, EditButton, DeleteButton } from "@refinedev/antd";
import { Table, Space, Tag } from "antd";

export default function ListCursos() {
  const { tableProps } = useTable({
    resource: "cursos",
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        
        <Table.Column dataIndex="id" title="ID" width={50} />
        
        <Table.Column 
            dataIndex="nombre" 
            title="Nombre del Curso" 
            render={(value) => <b>{value}</b>}
        />

        <Table.Column 
            dataIndex="descripcion" 
            title="Descripción" 
            ellipsis={true} // Corta el texto si es muy largo
        />

        <Table.Column 
            dataIndex="precio" 
            title="Precio" 
            render={(value) => (
                <Tag color="purple" style={{ fontSize: '14px' }}>
                    $ {Number(value).toLocaleString()}
                </Tag>
            )}
        />

        <Table.Column 
            dataIndex="duracion" 
            title="Duración" 
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
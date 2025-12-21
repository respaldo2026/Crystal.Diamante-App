"use client";

import React from "react";
import { List, useTable, EditButton, DeleteButton } from "@refinedev/antd";
import { Table, Space, Tag } from "antd";

export default function ListMatriculas() {
  const { tableProps } = useTable({
    resource: "matriculas",
    meta: {
      // AQUÍ ESTÁ EL TRUCO MAESTRO:
      // Usamos el signo ! para obligar a usar el nombre que encontramos en tu SQL.
      // Sintaxis: tabla!nombre_del_puente(columnas)
      select: "*, perfiles!fk_matriculas_perfiles_v2(nombre_completo), cursos!fk_matriculas_cursos_v2(nombre)",
    },
  });

  return (
    <List>
      <Table {...tableProps} rowKey="id">
        
        <Table.Column dataIndex="id" title="ID" width={50} />

        {/* Estudiante */}
        <Table.Column
          title="Estudiante"
          dataIndex={["perfiles", "nombre_completo"]} 
          render={(value) => value || "---"} 
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
            render={(value) => <Tag>{value || "Activo"}</Tag>}
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
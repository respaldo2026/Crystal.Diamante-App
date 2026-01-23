"use client";

import React, { useEffect, useState } from "react";
import { Card, Typography, Button, Spin } from "antd";
import { PlusOutlined, EditOutlined } from "@ant-design/icons";
import { useNavigation } from "@refinedev/core";
import { obtenerCursos } from "../../modules/academico/cursos.service";
import { useCurrentUser } from "@hooks/useCurrentUser";

const { Title, Text } = Typography;

export default function CursosList() {
  const { edit, create } = useNavigation();
  const { user } = useCurrentUser();
  const [cursos, setCursos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCursos() {
      setLoading(true);
      const data = await obtenerCursos();
      setCursos(data);
      setLoading(false);
    }
    fetchCursos();
  }, []);

  if (loading) return <Spin />;

  return (
    <Card>
      <Title level={2}>Lista de Cursos</Title>
      {cursos.map((curso: any) => (
        <Card key={curso.id}>
          <Text>{curso.nombre}</Text>
          <Button icon={<EditOutlined />} onClick={() => edit("cursos", curso.id)}>Editar</Button>
        </Card>
      ))}
      <Button type="primary" icon={<PlusOutlined />} onClick={() => create("cursos")}>Nuevo Curso</Button>
    </Card>
  );
}

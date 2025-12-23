import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';

// Estilos del PDF
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#fff',
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    border: '5px solid #722ed1', // Borde morado Crystal
  },
  title: { fontSize: 30, marginBottom: 10, color: '#722ed1', fontWeight: 'bold' },
  subtitle: { fontSize: 18, marginBottom: 20 },
  studentName: { fontSize: 28, marginVertical: 20, textDecoration: 'underline' },
  courseName: { fontSize: 22, color: '#555', marginBottom: 30 },
  footer: { position: 'absolute', bottom: 30, fontSize: 10, color: '#888' },
  date: { fontSize: 12, marginTop: 20 },
});

// El Documento PDF
export const DiplomaPDF = ({ alumno, curso, fecha }: any) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      
      {/* Encabezado */}
      <Text style={styles.title}>ACADEMIA CRYSTAL DIAMANTE</Text>
      <Text style={styles.subtitle}>Otorga el presente certificado a:</Text>

      {/* Nombre del Alumno */}
      <Text style={styles.studentName}>{alumno}</Text>

      <Text style={styles.subtitle}>Por haber completado satisfactoriamente el curso de:</Text>

      {/* Nombre del Curso */}
      <Text style={styles.courseName}>{curso}</Text>

      <Text style={styles.date}>Dado el día: {fecha}</Text>

      {/* Pie de página */}
      <Text style={styles.footer}>Certificado Oficial - Crystal App System</Text>
    </Page>
  </Document>
);
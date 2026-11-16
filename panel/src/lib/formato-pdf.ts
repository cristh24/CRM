// Formato en PDF (para imprimir y llenar a mano) con todas las preguntas del formulario de una actividad,
// en el mismo orden que el formulario del QR. Se genera en el navegador con jsPDF (texto, no imagen).
import { GRADOS } from '@crm/db'
import { ordenFormulario, type ElementoFormulario, type FormularioActividad } from '@/lib/formulario-actividad'

const AZUL: [number, number, number] = [0, 56, 101]
const DORADO: [number, number, number] = [247, 168, 0]
const GRIS: [number, number, number] = [100, 116, 139]
const SEDES = ['Juliaca (filial Juliaca)', 'Lima (campus Lima)', 'Tarapoto (filial Tarapoto)']

export async function descargarFormatoPdf(actividad: { nombre: string; lugar: string | null; fecha: string | null }, f: FormularioActividad) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const ANCHO = 210, ALTO = 297, M = 16, UTIL = ANCHO - 2 * M, PIE = ALTO - 16
  const ins = f.tipo === 'inscripcion'
  let y = 0

  // Encabezado (solo la primera página lleva la franja completa)
  pdf.setFillColor(...AZUL); pdf.rect(0, 0, ANCHO, 34, 'F')
  pdf.setFillColor(...DORADO); pdf.rect(0, 34, ANCHO, 2, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15)
  pdf.text('Universidad Peruana Unión · Admisión 2027', M, 14)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11)
  pdf.text(ins ? 'Ficha de inscripción' : 'Formato de registro', M, 21)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12)
  pdf.text(pdf.splitTextToSize(actividad.nombre, UTIL) as string[], M, 28.5)
  y = 44
  const extra = [actividad.lugar, actividad.fecha?.split('-').reverse().join('/')].filter(Boolean).join(' · ')
  pdf.setTextColor(...GRIS); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  pdf.text(`${extra ? extra + ' · ' : ''}Escribe con letra clara. Los campos con * son obligatorios.`, M, y)
  y += 6

  const nuevaPagina = () => {
    pdf.addPage()
    pdf.setFillColor(...AZUL); pdf.rect(0, 0, ANCHO, 4, 'F')
    y = 14
  }
  const espacio = (alto: number) => { if (y + alto > PIE) nuevaPagina() }

  const casilla = (x: number, yy: number) => { pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.3); pdf.rect(x, yy - 3, 3.2, 3.2) }
  const linea = (x1: number, x2: number, yy: number) => { pdf.setDrawColor(170, 180, 195); pdf.setLineWidth(0.25); pdf.line(x1, yy, x2, yy) }

  /** Título de la pregunta (numerado) y devuelve la altura usada */
  let numero = 0
  const titulo = (texto: string, obligatoria: boolean, ayuda?: string) => {
    numero++
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(30, 41, 59)
    const lineas = pdf.splitTextToSize(`${numero}. ${texto}${obligatoria ? ' *' : ''}`, UTIL) as string[]
    espacio(lineas.length * 4.6 + 10)
    pdf.text(lineas, M, y)
    y += lineas.length * 4.6
    if (ayuda) {
      pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(...GRIS)
      pdf.text(ayuda, M, y); y += 3.8
    }
  }
  const lineasEscribir = (n: number) => { for (let i = 0; i < n; i++) { y += 7; linea(M, M + UTIL, y) } y += 6 }
  /** Opciones con casillas: en columnas si son cortas, una por fila si son largas */
  const opciones = (lista: readonly string[], varias: boolean) => {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(30, 41, 59)
    const maxAncho = Math.max(...lista.map((o) => pdf.getTextWidth(o))) + 7
    const columnas = Math.max(1, Math.min(4, Math.floor(UTIL / Math.max(maxAncho, 30))))
    const anchoCol = UTIL / columnas
    y += 2
    for (let i = 0; i < lista.length; i += columnas) {
      const fila = lista.slice(i, i + columnas)
      const altos = fila.map((o) => (pdf.splitTextToSize(o, anchoCol - 7) as string[]).length)
      const alto = Math.max(...altos) * 4.2 + 2
      espacio(alto + 2)
      y += 4
      fila.forEach((o, j) => {
        const x = M + j * anchoCol
        casilla(x, y)
        pdf.text(pdf.splitTextToSize(o, anchoCol - 7) as string[], x + 5, y)
      })
      y += alto - 2
    }
    if (varias) { pdf.setFont('helvetica', 'italic'); pdf.setFontSize(8); pdf.setTextColor(...GRIS); pdf.text('Puedes marcar varias.', M, y + 2); y += 3 }
    y += 6
  }
  const lugar = (hasta: 'provincia' | 'distrito') => {
    const partes = hasta === 'provincia' ? ['Departamento', 'Provincia'] : ['Departamento', 'Provincia', 'Distrito']
    const ancho = UTIL / partes.length
    espacio(14); y += 8
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...GRIS)
    partes.forEach((p, i) => { linea(M + i * ancho, M + (i + 1) * ancho - 4, y); pdf.text(p, M + i * ancho, y + 3.5) })
    y += 11
  }
  const cajas = (n: number) => {
    espacio(12); y += 3
    for (let i = 0; i < n; i++) { pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.3); pdf.rect(M + i * 7, y, 6.5, 7) }
    y += 14
  }
  const fecha = () => {
    espacio(12); y += 8
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(30, 41, 59)
    linea(M, M + 12, y); pdf.text('/', M + 14, y); linea(M + 17, M + 29, y); pdf.text('/', M + 31, y); linea(M + 34, M + 52, y)
    pdf.setFontSize(8); pdf.setTextColor(...GRIS)
    pdf.text('día', M + 3, y + 3.5); pdf.text('mes', M + 20, y + 3.5); pdf.text('año', M + 40, y + 3.5)
    y += 10
  }

  const ETIQUETA: Record<string, string> = {
    sede: '¿A qué sede deseas postular?',
    nombre: 'Nombres y apellidos',
    celular: ins ? 'Número actual del postulante (WhatsApp)' : 'Celular (WhatsApp)',
    dni: ins ? 'Número de DNI' : 'DNI',
    grado: 'Grado',
    carrera: ins ? 'Carrera profesional' : 'Carrera que te interesa',
    colegio: ins ? 'Nombre del centro de procedencia educativa' : 'Colegio',
    procedencia: ins ? 'Domicilio' : '¿De dónde eres?',
  }

  for (const e of ordenFormulario(f) as ElementoFormulario[]) {
    if (e.tipo === 'seccion') {
      espacio(20); y += 2
      pdf.setFillColor(238, 243, 249); pdf.rect(M, y - 4.5, UTIL, 7, 'F')
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10.5); pdf.setTextColor(...AZUL)
      pdf.text(e.titulo.toUpperCase(), M + 2, y)
      y += 8
      continue
    }
    if (e.tipo === 'dato') {
      if (e.clave === 'sede') { titulo(ETIQUETA.sede!, true); opciones(SEDES, false) }
      else if (e.clave === 'dni') { titulo(ETIQUETA.dni!, e.obligatorio, '8 dígitos'); cajas(8) }
      else if (e.clave === 'grado') { titulo(ETIQUETA.grado!, e.obligatorio); opciones(GRADOS, false) }
      else if (e.clave === 'procedencia') { titulo(ETIQUETA.procedencia!, e.obligatorio); lugar('distrito') }
      else { titulo(ETIQUETA[e.clave]!, e.obligatorio); lineasEscribir(1) }
      continue
    }
    const p = e.p
    if (p.tipo === 'opcion' || p.tipo === 'varias') { titulo(p.texto, p.obligatoria); opciones(p.opciones ?? [], p.tipo === 'varias') }
    else if (p.tipo === 'si_no') { titulo(p.texto, p.obligatoria); opciones(['Sí', 'No'], false) }
    else if (p.tipo === 'lugar') { titulo(p.texto, p.obligatoria); lugar(p.hasta ?? 'distrito') }
    else if (p.tipo === 'fecha') { titulo(p.texto, p.obligatoria, 'día/mes/año'); fecha() }
    else if (p.tipo === 'texto') { titulo(p.texto, p.obligatoria); lineasEscribir(2) }
    else { titulo(p.texto, p.obligatoria); lineasEscribir(1) }
  }

  // Autorización (igual que en el formulario) y número de página
  espacio(16); y += 2
  casilla(M, y + 1)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(30, 41, 59)
  pdf.text(pdf.splitTextToSize('Acepto que la Universidad Peruana Unión me contacte por WhatsApp o llamada para darme información de admisión.', UTIL - 6) as string[], M + 5, y + 1)
  const paginas = pdf.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    pdf.setPage(i)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...GRIS)
    pdf.text(`Universidad Peruana Unión · Oficina de Admisión`, M, ALTO - 8)
    pdf.text(`Página ${i} de ${paginas}`, ANCHO - M, ALTO - 8, { align: 'right' })
  }

  const archivo = `Formato_${actividad.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60)}.pdf`
  pdf.save(archivo)
}

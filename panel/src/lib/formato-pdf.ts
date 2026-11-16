// Formato en PDF (una hoja A4, para imprimir y llenar a mano) con todas las preguntas del formulario de una
// actividad, en el mismo orden que el formulario del QR. Dos columnas; el tamaño de letra se ajusta solo para
// que todo entre en una hoja. Se genera en el navegador con jsPDF (texto, no imagen).
import type { jsPDF as JsPDF } from 'jspdf'
import { GRADOS } from '@crm/db'
import { ordenFormulario, type FormularioActividad } from '@/lib/formulario-actividad'

type Color = [number, number, number]
const AZUL: Color = [0, 56, 101]
const DORADO: Color = [247, 168, 0]
const TINTA: Color = [30, 41, 59]
const GRIS: Color = [110, 122, 140]
const SUAVE: Color = [190, 200, 212]
const FONDO_SECCION: Color = [232, 239, 247]

const ANCHO = 210, ALTO = 297, M = 10, SEPARACION = 6
const COLUMNA = (ANCHO - 2 * M - SEPARACION) / 2
const INICIO = 35            // debajo del encabezado y la indicación
const FIN = ALTO - 25        // encima de la autorización y la firma
const PT = 0.3528            // 1 punto en mm

interface Bloque { alto: number; seccion?: boolean; dibujar: (x: number, y: number) => void }

/** Logo blanco de la UPeU como PNG (jsPDF no dibuja SVG). */
async function logoPng(): Promise<{ datos: string; proporcion: number } | null> {
  try {
    const img = new Image()
    img.src = '/marca/logo-upeu-blanco.svg'
    await img.decode()
    const proporcion = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 4.15
    const lienzo = document.createElement('canvas')
    lienzo.height = 160; lienzo.width = Math.round(160 * proporcion)
    lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height)
    return { datos: lienzo.toDataURL('image/png'), proporcion }
  } catch {
    return null
  }
}

/** Bloques del formulario medidos con un tamaño de letra (s, en puntos). */
function bloques(pdf: JsPDF, f: FormularioActividad, s: number): Bloque[] {
  const ins = f.tipo === 'inscripcion'
  const lh = s * PT * 1.28            // alto de una línea de texto
  const espacio = lh * 0.6            // entre preguntas
  const caja = s * PT * 0.95          // casilla de las opciones
  const W = COLUMNA
  let numero = 0

  const fuente = (estilo: 'normal' | 'bold' | 'italic', tam: number, color: Color) => { pdf.setFont('helvetica', estilo); pdf.setFontSize(tam); pdf.setTextColor(...color) }
  const linea = (x1: number, x2: number, y: number) => { pdf.setDrawColor(...SUAVE); pdf.setLineWidth(0.2); pdf.line(x1, y, x2, y) }
  const cuadro = (x: number, y: number, a: number, b: number) => { pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.22); pdf.rect(x, y, a, b) }

  /** Título numerado de la pregunta: devuelve sus líneas y su alto */
  const titulo = (texto: string, obligatoria: boolean) => {
    numero++
    fuente('bold', s, TINTA)
    const lineas = pdf.splitTextToSize(`${numero}. ${texto}${obligatoria ? ' *' : ''}`, W) as string[]
    return { alto: lineas.length * lh, dibujar: (x: number, y: number) => { fuente('bold', s, TINTA); pdf.text(lineas, x, y + lh * 0.78, { lineHeightFactor: 1.28 }) } }
  }
  const bloque = (t: ReturnType<typeof titulo>, alto: number, cuerpo: (x: number, y: number) => void): Bloque => ({
    alto: t.alto + alto + espacio,
    dibujar: (x, y) => { t.dibujar(x, y); cuerpo(x, y + t.alto) },
  })

  /** Línea para escribir */
  const escribir = (t: ReturnType<typeof titulo>, lineas = 1) =>
    bloque(t, lh * 1.55 * lineas, (x, y) => { for (let i = 1; i <= lineas; i++) linea(x, x + W, y + lh * 1.4 * i) })

  /** Opciones con casillas, una al lado de otra (si una no entra, pasa a la siguiente fila) */
  const opciones = (t: ReturnType<typeof titulo>, lista: readonly string[], varias = false) => {
    const tam = s - 0.4
    fuente('normal', tam, TINTA)
    const filas: { x: number; fila: number; lineas: string[] }[] = []
    let x = 0, fila = 0, altoFila = 1, altoTotal = 0
    const alturas: number[] = []
    for (const o of lista) {
      const lineas = pdf.splitTextToSize(o, W - caja - 1.5) as string[]
      const ancho = caja + 1.2 + Math.max(...lineas.map((l) => pdf.getTextWidth(l))) + 3.2
      if (x > 0 && x + ancho > W) { alturas.push(altoFila); fila++; x = 0; altoFila = 1 }
      filas.push({ x, fila, lineas })
      altoFila = Math.max(altoFila, lineas.length)
      x += ancho
    }
    alturas.push(altoFila)
    const lhO = tam * PT * 1.25
    const inicioFila = alturas.map((_, i) => alturas.slice(0, i).reduce((a, b) => a + b * lhO + lhO * 0.35, 0))
    altoTotal = inicioFila.at(-1)! + alturas.at(-1)! * lhO + lhO * 0.35 + (varias ? lhO : 0)
    return bloque(t, altoTotal + lh * 0.15, (bx, by) => {
      fuente('normal', tam, TINTA)
      for (const o of filas) {
        const y = by + lh * 0.2 + inicioFila[o.fila]!
        cuadro(bx + o.x, y + lhO * 0.18, caja, caja)
        pdf.text(o.lineas, bx + o.x + caja + 1.2, y + lhO * 0.78, { lineHeightFactor: 1.25 })
      }
      if (varias) { fuente('italic', tam - 0.8, GRIS); pdf.text('(puedes marcar varias)', bx, by + altoTotal) }
    })
  }

  /** Cajitas para dígitos con una letra guía tenue (DNI, fecha) */
  const digitos = (t: ReturnType<typeof titulo>, grupos: string[]) => {
    const lado = lh * 1.35
    return bloque(t, lado + lh * 0.35, (x, y) => {
      let cx = x
      grupos.forEach((g, i) => {
        if (i > 0) { fuente('normal', s + 1, GRIS); pdf.text('/', cx + 0.6, y + lado * 0.82); cx += 2.6 }
        for (const letra of g) {
          cuadro(cx, y + lh * 0.2, lado, lado)
          fuente('normal', s - 1.5, SUAVE); pdf.text(letra, cx + lado / 2, y + lh * 0.2 + lado * 0.68, { align: 'center' })
          cx += lado + 0.6
        }
      })
    })
  }

  /** Departamento / Provincia (/ Distrito) */
  const lugar = (t: ReturnType<typeof titulo>, hasta: 'provincia' | 'distrito') => {
    const partes = hasta === 'provincia' ? ['Departamento', 'Provincia'] : ['Departamento', 'Provincia', 'Distrito']
    const ancho = W / partes.length
    return bloque(t, lh * 2.3, (x, y) => partes.forEach((p, i) => {
      linea(x + i * ancho, x + (i + 1) * ancho - 3, y + lh * 1.35)
      fuente('normal', s - 1.6, GRIS); pdf.text(p, x + i * ancho, y + lh * 2.05)
    }))
  }

  const ETIQUETA: Record<string, string> = {
    nombre: 'Nombres y apellidos',
    celular: ins ? 'Número actual del postulante (WhatsApp)' : 'Celular (WhatsApp)',
    dni: ins ? 'Número de DNI' : 'DNI',
    grado: 'Grado',
    carrera: ins ? 'Carrera profesional' : 'Carrera que te interesa',
    colegio: ins ? 'Nombre del centro de procedencia educativa' : 'Colegio',
    procedencia: ins ? 'Domicilio' : '¿De dónde eres?',
  }

  return ordenFormulario(f).map((e): Bloque => {
    if (e.tipo === 'seccion') {
      const alto = lh * 1.55
      return {
        alto: alto + espacio, seccion: true,
        dibujar: (x, y) => {
          pdf.setFillColor(...FONDO_SECCION); pdf.rect(x, y, W, alto, 'F')
          pdf.setFillColor(...DORADO); pdf.rect(x, y, 1.1, alto, 'F')
          fuente('bold', s, AZUL); pdf.text(e.titulo.toUpperCase(), x + 2.6, y + alto * 0.68)
        },
      }
    }
    if (e.tipo === 'dato') {
      if (e.clave === 'sede') return opciones(titulo('¿A qué sede deseas postular?', true), ['Juliaca', 'Lima', 'Tarapoto'])
      if (e.clave === 'dni') return digitos(titulo(ETIQUETA.dni!, e.obligatorio), [' '.repeat(8)])
      if (e.clave === 'grado') return opciones(titulo(ETIQUETA.grado!, e.obligatorio), GRADOS)
      if (e.clave === 'procedencia') return lugar(titulo(ETIQUETA.procedencia!, e.obligatorio), 'distrito')
      return escribir(titulo(ETIQUETA[e.clave]!, e.obligatorio))
    }
    const p = e.p
    const t = titulo(p.texto, p.obligatoria)
    if (p.tipo === 'opcion' || p.tipo === 'varias') return opciones(t, p.opciones ?? [], p.tipo === 'varias')
    if (p.tipo === 'si_no') return opciones(t, ['Sí', 'No'])
    if (p.tipo === 'lugar') return lugar(t, p.hasta ?? 'distrito')
    if (p.tipo === 'fecha') return digitos(t, ['DD', 'MM', 'AAAA'])
    if (p.tipo === 'texto') return escribir(t, 2)
    return escribir(t)
  })
}

/** Reparte los bloques en columnas (izquierda, derecha y, si no alcanza, otra hoja). Un título de sección no queda solo al pie. */
function repartir(lista: Bloque[], arriba: (pagina: number) => number) {
  const ubicados: { b: Bloque; pagina: number; columna: number; y: number }[] = []
  let pagina = 0, columna = 0, y = arriba(0)
  const siguiente = () => { if (columna === 0) columna = 1; else { pagina++; columna = 0 } y = arriba(pagina) }
  lista.forEach((b, i) => {
    const necesita = b.seccion && lista[i + 1] ? b.alto + lista[i + 1]!.alto : b.alto
    if (y + necesita > FIN && y > arriba(pagina)) siguiente()
    ubicados.push({ b, pagina, columna, y })
    y += b.alto
  })
  return { ubicados, paginas: pagina + 1 }
}

type Actividad = { nombre: string; lugar: string | null; fecha: string | null }

export async function descargarFormatoPdf(actividad: Actividad, f: FormularioActividad) {
  const pdf = await crearFormatoPdf(actividad, f, await logoPng())
  pdf.save(`Formato_${actividad.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 60)}.pdf`)
}

/** Arma el PDF (sin descargarlo). */
export async function crearFormatoPdf(actividad: Actividad, f: FormularioActividad, logo: { datos: string; proporcion: number } | null): Promise<JsPDF> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const ins = f.tipo === 'inscripcion'
  const arriba = (pagina: number) => (pagina === 0 ? INICIO : 16)

  // El tamaño de letra más grande con el que todo entra en una hoja (si ni con letra chica entra, sigue en otra)
  let s = 9.5
  let plan = repartir(bloques(pdf, f, s), arriba)
  while (plan.paginas > 1 && s > 5.6) { s -= 0.25; plan = repartir(bloques(pdf, f, s), arriba) }
  // bloques() numera las preguntas al medirlas: se vuelven a construir para dibujar con el tamaño elegido
  const lista = bloques(pdf, f, s)
  plan = repartir(lista, arriba)

  // Encabezado: franja azul con el logo y el nombre de la actividad
  pdf.setFillColor(...AZUL); pdf.rect(0, 0, ANCHO, 25, 'F')
  pdf.setFillColor(...DORADO); pdf.rect(0, 25, ANCHO, 1.6, 'F')
  if (logo) pdf.addImage(logo.datos, 'PNG', M, 6.5, 12 * logo.proporcion, 12)
  else { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13); pdf.setTextColor(255, 255, 255); pdf.text('Universidad Peruana Unión', M, 14.5) }
  pdf.setTextColor(...DORADO); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5)
  pdf.text('ADMISIÓN 2027', ANCHO - M, 8.5, { align: 'right' })
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(14)
  pdf.text(ins ? 'FICHA DE INSCRIPCIÓN' : 'FICHA DE REGISTRO', ANCHO - M, 15, { align: 'right' })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5)
  const sub = [actividad.nombre, actividad.lugar, actividad.fecha?.split('-').reverse().join('/')].filter(Boolean).join(' · ')
  pdf.text(pdf.splitTextToSize(sub, 110)[0] as string, ANCHO - M, 20.5, { align: 'right' })

  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(7.5); pdf.setTextColor(...GRIS)
  pdf.text('Escribe con letra de imprenta clara y marca con una X. Los campos con * son obligatorios.', M, 31)

  // Columnas con una línea fina al medio
  for (let p = 0; p < plan.paginas; p++) {
    if (p > 0) { pdf.addPage(); pdf.setFillColor(...AZUL); pdf.rect(0, 0, ANCHO, 4, 'F'); pdf.setFillColor(...DORADO); pdf.rect(0, 4, ANCHO, 0.8, 'F') }
    pdf.setDrawColor(...SUAVE); pdf.setLineWidth(0.15)
    pdf.line(ANCHO / 2, arriba(p) - 1, ANCHO / 2, FIN)
  }
  for (const u of plan.ubicados) {
    pdf.setPage(u.pagina + 1)
    u.b.dibujar(M + u.columna * (COLUMNA + SEPARACION), u.y)
  }

  // Pie de la última hoja: autorización, firma y fecha
  pdf.setPage(plan.paginas)
  const yA = FIN + 5
  pdf.setDrawColor(...SUAVE); pdf.setLineWidth(0.2); pdf.line(M, FIN + 1.5, ANCHO - M, FIN + 1.5)
  pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.25); pdf.rect(M, yA - 2.6, 3, 3)
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...TINTA)
  pdf.text(pdf.splitTextToSize('Acepto que la Universidad Peruana Unión me contacte por WhatsApp o llamada para darme información de admisión.', 105) as string[], M + 4.5, yA)
  const linea = (x1: number, x2: number, y: number, rotulo: string) => {
    pdf.setDrawColor(...TINTA); pdf.setLineWidth(0.2); pdf.line(x1, y, x2, y)
    pdf.setFontSize(7); pdf.setTextColor(...GRIS); pdf.text(rotulo, (x1 + x2) / 2, y + 3.2, { align: 'center' })
  }
  linea(128, 168, yA + 8, 'Firma del postulante')
  linea(173, ANCHO - M, yA + 8, 'Fecha')
  for (let p = 1; p <= plan.paginas; p++) {
    pdf.setPage(p)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(...GRIS)
    pdf.text('Universidad Peruana Unión · Oficina de Admisión', ANCHO / 2, ALTO - 5, { align: 'center' })
    if (plan.paginas > 1) pdf.text(`${p}/${plan.paginas}`, ANCHO - M, ALTO - 5, { align: 'right' })
  }

  return pdf
}

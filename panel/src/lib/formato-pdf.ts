// Formato en PDF (una hoja A4, para imprimir y llenar a mano) con todas las preguntas del formulario de una
// actividad, en el mismo orden que el formulario del QR. Dos columnas; el tamaño de letra se ajusta solo para
// que todo entre en una hoja. Se genera en el navegador con jsPDF (texto, no imagen).
import type { jsPDF as JsPDF } from 'jspdf'
import { GRADOS } from '@crm/db'
import { ordenFormulario, type FormularioActividad } from '@/lib/formulario-actividad'

type Color = [number, number, number]
const AZUL: Color = [0, 56, 101]
const AZUL_MEDIO: Color = [20, 86, 140]
const AZUL_CLARO: Color = [58, 120, 178]
const DORADO: Color = [247, 168, 0]
const TINTA: Color = [30, 41, 59]
const GRIS: Color = [110, 122, 140]
const BORDE: Color = [196, 210, 226]
const CAMPO: Color = [243, 247, 252]       // fondo de los espacios para escribir
const AVISO: Color = [255, 247, 224]       // franja de instrucciones

const ANCHO = 210, ALTO = 297, M = 10, SEPARACION = 6
const COLUMNA = (ANCHO - 2 * M - SEPARACION) / 2
const INICIO = 43            // debajo del encabezado y las instrucciones
const FIN = ALTO - 30        // encima de la autorización, la firma y el pie
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
  const espacio = lh * 0.7            // entre preguntas
  const caja = s * PT * 0.95          // casilla de las opciones
  const W = COLUMNA
  const sangria = lh * 1.25           // espacio del número en círculo
  let numero = 0

  const fuente = (estilo: 'normal' | 'bold' | 'italic', tam: number, color: Color) => { pdf.setFont('helvetica', estilo); pdf.setFontSize(tam); pdf.setTextColor(...color) }
  /** Espacio para escribir: caja celeste redondeada */
  const campo = (x: number, y: number, a: number, b: number) => {
    pdf.setFillColor(...CAMPO); pdf.setDrawColor(...BORDE); pdf.setLineWidth(0.2)
    pdf.roundedRect(x, y, a, b, 1.1, 1.1, 'FD')
  }
  const casilla = (x: number, y: number, a: number) => {
    pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...AZUL_MEDIO); pdf.setLineWidth(0.25)
    pdf.roundedRect(x, y, a, a, 0.45, 0.45, 'FD')
  }

  /** Título de la pregunta con su número en un círculo azul */
  const titulo = (texto: string, obligatoria: boolean) => {
    const n = ++numero
    fuente('bold', s, TINTA)
    // El asterisco va aparte (en dorado): se deja su espacio al cortar las líneas
    const lineas = pdf.splitTextToSize(texto, W - sangria - (obligatoria ? 2.5 : 0)) as string[]
    return {
      alto: lineas.length * lh,
      dibujar: (x: number, y: number) => {
        const r = lh * 0.55
        pdf.setFillColor(...AZUL); pdf.circle(x + r, y + lh * 0.5, r, 'F')
        fuente('bold', s - (n > 9 ? 1.8 : 1), [255, 255, 255])
        pdf.text(String(n), x + r, y + lh * 0.5 + (s - 1.4) * PT * 0.36, { align: 'center' })
        fuente('bold', s, TINTA)
        pdf.text(lineas, x + sangria, y + lh * 0.78, { lineHeightFactor: 1.28 })
        if (obligatoria) {
          const ancho = pdf.getTextWidth(lineas.at(-1)!)
          pdf.setTextColor(...DORADO); pdf.text('*', x + sangria + ancho + 0.8, y + lh * (lineas.length - 1) + lh * 0.78)
        }
      },
    }
  }
  const bloque = (t: ReturnType<typeof titulo>, alto: number, cuerpo: (x: number, y: number) => void): Bloque => ({
    alto: t.alto + alto + espacio,
    dibujar: (x, y) => { t.dibujar(x, y); cuerpo(x + sangria, y + t.alto) },
  })
  const WC = W - sangria   // ancho del cuerpo (debajo del título)

  /** Espacio para escribir (una o varias líneas) */
  const escribir = (t: ReturnType<typeof titulo>, lineas = 1) => {
    const alto = lh * (1.05 + 1.15 * lineas)
    return bloque(t, alto + lh * 0.25, (x, y) => campo(x, y + lh * 0.25, WC, alto))
  }

  /** Opciones con casillas, una al lado de otra (si una no entra, pasa a la siguiente fila) */
  const opciones = (t: ReturnType<typeof titulo>, lista: readonly string[], varias = false) => {
    const tam = s - 0.4
    fuente('normal', tam, TINTA)
    const filas: { x: number; fila: number; lineas: string[] }[] = []
    let x = 0, fila = 0, altoFila = 1
    const alturas: number[] = []
    for (const o of lista) {
      const lineas = pdf.splitTextToSize(o, WC - caja - 1.5) as string[]
      const ancho = caja + 1.3 + Math.max(...lineas.map((l) => pdf.getTextWidth(l))) + 3.4
      if (x > 0 && x + ancho > WC) { alturas.push(altoFila); fila++; x = 0; altoFila = 1 }
      filas.push({ x, fila, lineas })
      altoFila = Math.max(altoFila, lineas.length)
      x += ancho
    }
    alturas.push(altoFila)
    const lhO = tam * PT * 1.25
    const inicioFila = alturas.map((_, i) => alturas.slice(0, i).reduce((a, b) => a + b * lhO + lhO * 0.4, 0))
    const altoTotal = inicioFila.at(-1)! + alturas.at(-1)! * lhO + lhO * 0.4 + (varias ? lhO : 0)
    return bloque(t, altoTotal + lh * 0.2, (bx, by) => {
      for (const o of filas) {
        const y = by + lh * 0.25 + inicioFila[o.fila]!
        casilla(bx + o.x, y + lhO * 0.15, caja)
        fuente('normal', tam, TINTA)
        pdf.text(o.lineas, bx + o.x + caja + 1.3, y + lhO * 0.78, { lineHeightFactor: 1.25 })
      }
      if (varias) { fuente('italic', tam - 0.8, GRIS); pdf.text('(puedes marcar varias)', bx, by + altoTotal + lh * 0.1) }
    })
  }

  /** Cajitas para dígitos con una letra guía tenue (DNI, fecha) */
  const digitos = (t: ReturnType<typeof titulo>, grupos: string[]) => {
    const lado = lh * 1.45
    return bloque(t, lado + lh * 0.45, (x, y) => {
      let cx = x
      grupos.forEach((g, i) => {
        if (i > 0) { fuente('bold', s + 1, AZUL_CLARO); pdf.text('/', cx + 0.5, y + lh * 0.25 + lado * 0.75); cx += 2.8 }
        for (const letra of g) {
          campo(cx, y + lh * 0.25, lado, lado)
          fuente('normal', s - 1.5, BORDE); pdf.text(letra, cx + lado / 2, y + lh * 0.25 + lado * 0.66, { align: 'center' })
          cx += lado + 0.7
        }
      })
    })
  }

  /** Departamento / Provincia (/ Distrito): cajas con su rótulo debajo */
  const lugar = (t: ReturnType<typeof titulo>, hasta: 'provincia' | 'distrito') => {
    const partes = hasta === 'provincia' ? ['Departamento', 'Provincia'] : ['Departamento', 'Provincia', 'Distrito']
    const ancho = (WC + 1.5) / partes.length
    const alto = lh * 1.6
    return bloque(t, alto + lh * 1.05, (x, y) => partes.forEach((p, i) => {
      campo(x + i * ancho, y + lh * 0.25, ancho - 1.5, alto)
      fuente('normal', s - 1.8, GRIS); pdf.text(p, x + i * ancho + 0.6, y + lh * 0.25 + alto + lh * 0.72)
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
      const alto = lh * 1.75
      return {
        alto: alto + espacio, seccion: true,
        dibujar: (x, y) => {
          // Barra azul con una pestaña dorada
          pdf.setFillColor(...AZUL); pdf.roundedRect(x, y, W, alto, 1.3, 1.3, 'F')
          pdf.setFillColor(...DORADO); pdf.roundedRect(x, y, 3.2, alto, 1.3, 1.3, 'F'); pdf.rect(x + 1.6, y, 1.6, alto, 'F')
          pdf.setFillColor(...AZUL_MEDIO); pdf.triangle(x + W - alto * 1.6, y + alto, x + W - 1.3, y, x + W - 1.3, y + alto, 'F')
          fuente('bold', s, [255, 255, 255]); pdf.text(e.titulo.toUpperCase(), x + 5.2, y + alto * 0.66, { charSpace: 0.25 })
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
  plan = repartir(bloques(pdf, f, s), arriba)

  // ── Encabezado: franja azul con figuras doradas, logo, título y la actividad ──
  const AE = 31
  pdf.setFillColor(...AZUL); pdf.rect(0, 0, ANCHO, AE, 'F')
  pdf.setFillColor(...AZUL_MEDIO); pdf.triangle(ANCHO - 95, AE, ANCHO, 0, ANCHO, AE, 'F')
  pdf.setFillColor(...AZUL_CLARO); pdf.triangle(ANCHO - 40, AE, ANCHO, 6, ANCHO, AE, 'F')
  pdf.setFillColor(...DORADO); pdf.triangle(ANCHO - 16, AE, ANCHO, AE - 9, ANCHO, AE, 'F')
  pdf.rect(0, AE, ANCHO, 1.8, 'F')
  if (logo) pdf.addImage(logo.datos, 'PNG', M, 7, 13 * logo.proporcion, 13)
  else { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(255, 255, 255); pdf.text('Universidad Peruana Unión', M, 15.5) }
  // Etiqueta dorada "ADMISIÓN 2027"
  const etiqueta = 'ADMISIÓN 2027'
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5)
  const anchoEt = pdf.getTextWidth(etiqueta) + 6
  pdf.setFillColor(...DORADO); pdf.roundedRect(ANCHO - M - anchoEt, 5, anchoEt, 5.2, 2.6, 2.6, 'F')
  pdf.setTextColor(...AZUL); pdf.text(etiqueta, ANCHO - M - anchoEt / 2, 8.6, { align: 'center' })
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(18)
  pdf.text(ins ? 'FICHA DE INSCRIPCIÓN' : 'FICHA DE REGISTRO', ANCHO - M, 18.5, { align: 'right' })
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9)
  const sub = [actividad.nombre, actividad.lugar, actividad.fecha?.split('-').reverse().join('/')].filter(Boolean).join(' · ')
  pdf.text(pdf.splitTextToSize(sub, 120)[0] as string, ANCHO - M, 25, { align: 'right' })
  // Línea "Campus Juliaca" bajo el logo
  pdf.setFontSize(7); pdf.setTextColor(...DORADO); pdf.text('CAMPUS JULIACA', M, 25, { charSpace: 0.4 })

  // ── Instrucciones ──
  pdf.setFillColor(...AVISO); pdf.roundedRect(M, 35.5, ANCHO - 2 * M, 5.6, 1.4, 1.4, 'F')
  pdf.setFillColor(...DORADO); pdf.roundedRect(M, 35.5, 2.4, 5.6, 1.2, 1.2, 'F'); pdf.rect(M + 1.2, 35.5, 1.2, 5.6, 'F')
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.5); pdf.setTextColor(...AZUL)
  pdf.text('INSTRUCCIONES:', M + 4.5, 39.2)
  const xInstr = M + 4.5 + pdf.getTextWidth('INSTRUCCIONES:') + 2
  pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...TINTA)
  pdf.text('Escribe con letra de imprenta clara y marca con una X. Los campos con * son obligatorios.', xInstr, 39.2)

  // Columnas con una línea fina al medio
  for (let p = 0; p < plan.paginas; p++) {
    if (p > 0) { pdf.addPage(); pdf.setFillColor(...AZUL); pdf.rect(0, 0, ANCHO, 5, 'F'); pdf.setFillColor(...DORADO); pdf.rect(0, 5, ANCHO, 1, 'F') }
    pdf.setDrawColor(...BORDE); pdf.setLineWidth(0.2); pdf.setLineDashPattern([0.8, 0.8], 0)
    pdf.line(ANCHO / 2, arriba(p), ANCHO / 2, FIN)
    pdf.setLineDashPattern([], 0)
  }
  for (const u of plan.ubicados) {
    pdf.setPage(u.pagina + 1)
    u.b.dibujar(M + u.columna * (COLUMNA + SEPARACION), u.y)
  }

  // ── Pie de la última hoja: autorización, firma y fecha en un recuadro ──
  pdf.setPage(plan.paginas)
  const yR = FIN + 2
  pdf.setFillColor(...CAMPO); pdf.setDrawColor(...BORDE); pdf.setLineWidth(0.2)
  pdf.roundedRect(M, yR, ANCHO - 2 * M, 16, 1.6, 1.6, 'FD')
  pdf.setFillColor(255, 255, 255); pdf.setDrawColor(...AZUL_MEDIO); pdf.setLineWidth(0.3)
  pdf.roundedRect(M + 3, yR + 3.2, 3.4, 3.4, 0.5, 0.5, 'FD')
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(...TINTA)
  pdf.text(pdf.splitTextToSize('Acepto que la Universidad Peruana Unión me contacte por WhatsApp o llamada para darme información de admisión.', 92) as string[], M + 8.5, yR + 5.8)
  const firma = (x1: number, x2: number, rotulo: string) => {
    pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.25); pdf.line(x1, yR + 11, x2, yR + 11)
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.8); pdf.setTextColor(...AZUL)
    pdf.text(rotulo, (x1 + x2) / 2, yR + 14, { align: 'center' })
  }
  firma(118, 162, 'FIRMA DEL POSTULANTE')
  firma(167, ANCHO - M - 3, 'FECHA')

  for (let p = 1; p <= plan.paginas; p++) {
    pdf.setPage(p)
    pdf.setFillColor(...DORADO); pdf.rect(0, ALTO - 8.8, ANCHO, 0.8, 'F')
    pdf.setFillColor(...AZUL); pdf.rect(0, ALTO - 8, ANCHO, 8, 'F')
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(255, 255, 255)
    pdf.text('Universidad Peruana Unión  ·  Oficina de Admisión  ·  Campus Juliaca', ANCHO / 2, ALTO - 3.4, { align: 'center' })
    if (plan.paginas > 1) pdf.text(`${p}/${plan.paginas}`, ANCHO - M, ALTO - 3.4, { align: 'right' })
  }

  return pdf
}

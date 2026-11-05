// Aviso del sistema con las respuestas de un formulario ("• Pregunta: respuesta" por línea):
// se muestran en una tabla de dos columnas (pregunta | respuesta) y la dirección de domicilio
// va en su propio bloque, aparte del lugar de nacimiento. Sin respuestas, el texto tal cual.

const DE_DOMICILIO = /^(ubicaci[oó]n|direcci[oó]n)/i

type Fila = [pregunta: string, respuesta: string]

function Tabla({ titulo, filas }: { titulo?: string; filas: Fila[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-amber-200 bg-white/70">
      {titulo && <p className="border-b border-amber-200 bg-amber-100/70 px-2.5 py-1 text-[11px] font-semibold text-amber-900">{titulo}</p>}
      <table className="w-full text-left text-xs">
        <tbody className="divide-y divide-amber-100">
          {filas.map(([pregunta, respuesta], i) => (
            <tr key={i} className="align-top">
              <th scope="row" className="w-2/5 px-2.5 py-1.5 font-medium text-slate-500">{pregunta}</th>
              <td className="px-2.5 py-1.5 break-words text-slate-800">{respuesta || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function NotaSistema({ texto, domicilio }: {
  texto: string | null
  /** Departamento · provincia · distrito del lead (va con la dirección de domicilio) */
  domicilio?: string | null
}) {
  const lineas = (texto ?? '').split('\n')
  const encabezado = lineas.filter((l) => !l.startsWith('• '))
  const filas: Fila[] = lineas.filter((l) => l.startsWith('• ')).map((l) => {
    const linea = l.slice(2)
    const corte = linea.indexOf(': ')
    return corte < 0 ? [linea, ''] : [linea.slice(0, corte), linea.slice(corte + 2)]
  })
  if (filas.length < 2) return <span className="whitespace-pre-wrap">{texto}</span>

  const datos = filas.filter(([p]) => !DE_DOMICILIO.test(p))
  const casa = filas.filter(([p]) => DE_DOMICILIO.test(p))
  if (casa.length && domicilio) casa.unshift(['Departamento · provincia · distrito', domicilio])

  return (
    <div className="space-y-2 text-left">
      {encabezado.join('\n').trim() && <p className="whitespace-pre-wrap">{encabezado.join('\n')}</p>}
      {datos.length > 0 && <Tabla titulo={casa.length ? '🪪 Datos personales y de admisión' : undefined} filas={datos} />}
      {casa.length > 0 && <Tabla titulo="🏠 Dirección de domicilio (donde vive ahora)" filas={casa} />}
    </div>
  )
}

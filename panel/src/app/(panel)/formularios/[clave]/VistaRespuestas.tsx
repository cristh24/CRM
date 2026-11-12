'use client'

// Respuestas de un formulario como en un cuestionario: Resumen (gráficos por pregunta), Individual (una por una) y Tabla.
import Link from '@/components/Enlace'
import { useMemo, useState, useTransition } from 'react'
import { BotonCsv } from '@/components/BotonCsv'
import { useAviso, useConfirmar } from '@/components/Confirmacion'
import { fechaHora } from '@/lib/formato'
import type { Envio, PreguntaVista } from '@/lib/respuestas-formularios'
import { marcarDescuento } from '../acciones'

type Pestana = 'resumen' | 'individual' | 'tabla'
const PERIODOS = { todo: 'Todo', '7': 'Últimos 7 días', '30': 'Últimos 30 días' } as const

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const Vacio = () => <span className="text-slate-400">—</span>

export function VistaRespuestas({ clave, puedeMarcar, titulo, preguntas, envios }: {
  clave: string
  /** Super admin o administrador: marca y quita el "Descuento aplicado"; los demás solo lo ven */
  puedeMarcar: boolean
  titulo: string; preguntas: PreguntaVista[]; envios: Envio[]
}) {
  const [pestana, setPestana] = useState<Pestana>('resumen')
  const [busqueda, setBusqueda] = useState('')
  const [periodo, setPeriodo] = useState<keyof typeof PERIODOS>('todo')
  const [indice, setIndice] = useState(0)
  // El período se cuenta desde que se abrió la página
  const [ahora] = useState(() => Date.now())

  const filtrados = useMemo(() => {
    const q = sinTildes(busqueda.trim())
    const desde = periodo === 'todo' ? '' : new Date(ahora - Number(periodo) * 86_400_000).toISOString()
    return envios.filter((e) =>
      (!desde || e.fecha >= desde)
      && (!q || sinTildes(`${e.nombre} ${e.telefono} ${e.valores.dni ?? ''} ${e.valores.colegio ?? ''}`).includes(q)))
  }, [envios, busqueda, periodo, ahora])
  const actual = filtrados[Math.min(indice, Math.max(filtrados.length - 1, 0))]

  const pestanas: [Pestana, string][] = [['resumen', 'Resumen'], ['individual', 'Individual'], ['tabla', 'Tabla']]
  return (
    <div className="space-y-4">
      <div className="tarjeta flex flex-wrap items-center gap-3 p-4">
        <p className="mr-auto text-lg font-semibold">
          {filtrados.length} {filtrados.length === 1 ? 'respuesta' : 'respuestas'}
          {filtrados.length !== envios.length && <span className="text-sm font-normal text-slate-500"> de {envios.length}</span>}
        </p>
        <input
          value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setIndice(0) }}
          placeholder="Buscar por nombre, celular, DNI o colegio" className="campo w-auto min-w-64"
        />
        <select value={periodo} onChange={(e) => { setPeriodo(e.target.value as keyof typeof PERIODOS); setIndice(0) }} className="campo w-auto">
          {Object.entries(PERIODOS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {filtrados.length > 0 && (
          <BotonCsv
            nombreArchivo={`respuestas-${titulo}`}
            filas={[
              ['Fecha', 'Asesor', ...preguntas.map((p) => p.texto), 'Descuento aplicado'],
              ...filtrados.map((e) => [fechaHora(e.fecha), e.asesor, ...preguntas.map((p) => e.valores[p.id] ?? ''), e.descuento ? 'Sí' : 'No']),
            ]}
          />
        )}
      </div>

      <div role="tablist" className="flex justify-center gap-1 border-b border-slate-200">
        {pestanas.map(([v, t]) => (
          <button
            key={v} role="tab" aria-selected={pestana === v} onClick={() => setPestana(v)}
            className={`-mb-px border-b-2 px-5 py-2 text-sm font-semibold transition ${pestana === v ? 'border-marca-700 text-marca-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {!filtrados.length ? (
        <p className="tarjeta px-5 py-10 text-center text-sm text-slate-500">
          {envios.length ? 'Ninguna respuesta coincide con la búsqueda.' : 'Aún nadie llenó este formulario.'}
        </p>
      ) : pestana === 'resumen' ? (
        <div className="mx-auto max-w-3xl space-y-4">
          {preguntas.map((p) => <ResumenPregunta key={p.id} pregunta={p} envios={filtrados} />)}
        </div>
      ) : pestana === 'individual' && actual ? (
        <div className="mx-auto max-w-3xl space-y-4">
          <div className="tarjeta flex flex-wrap items-center justify-center gap-3 p-3">
            <button onClick={() => setIndice(Math.max(0, indice - 1))} disabled={indice === 0} className="boton-secundario" aria-label="Anterior">‹</button>
            <select value={Math.min(indice, filtrados.length - 1)} onChange={(e) => setIndice(Number(e.target.value))} className="campo w-auto max-w-xs">
              {filtrados.map((e, i) => <option key={e.leadId} value={i}>{i + 1}. {e.nombre}</option>)}
            </select>
            <span className="text-sm text-slate-500">de {filtrados.length}</span>
            <button onClick={() => setIndice(Math.min(filtrados.length - 1, indice + 1))} disabled={indice >= filtrados.length - 1} className="boton-secundario" aria-label="Siguiente">›</button>
          </div>
          <div className="tarjeta border-t-8 border-t-marca-700 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-lg font-semibold">{actual.nombre}</p>
              <Link href={`/leads/${actual.leadId}`} className="text-sm font-medium text-marca-700 hover:underline">Abrir lead →</Link>
            </div>
            <p className="text-xs text-slate-500">Enviado: {fechaHora(actual.fecha)}{actual.asesor ? ` · Asesor: ${actual.asesor}` : ''}</p>
            <div className="mt-3"><CheckDescuento key={actual.leadId} clave={clave} envio={actual} puedeMarcar={puedeMarcar} conTexto /></div>
          </div>
          {preguntas.map((p) => (
            <div key={p.id} className="tarjeta p-5">
              <p className="text-sm font-medium text-slate-700">{p.texto}</p>
              <p className="mt-2 border-b border-slate-200 pb-1 whitespace-pre-wrap">{actual.valores[p.id] || <Vacio />}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Alumno</th>
                {preguntas.filter((p) => p.id !== 'nombre').map((p) => <th key={p.id} className="max-w-[16rem] min-w-32 px-4 py-2.5">{p.texto}</th>)}
                <th className="px-4 py-2.5">Fecha</th>
                <th className="px-4 py-2.5 text-center">Descuento aplicado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((e) => (
                <tr key={e.leadId} className="align-top hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link href={`/leads/${e.leadId}`} className="font-medium text-marca-700 hover:underline">{e.nombre}</Link>
                    {e.asesor && <p className="text-xs text-slate-500">{e.asesor}</p>}
                  </td>
                  {preguntas.filter((p) => p.id !== 'nombre').map((p) => (
                    <td key={p.id} className="max-w-[16rem] px-4 py-2.5 whitespace-pre-wrap">{e.valores[p.id] || <Vacio />}</td>
                  ))}
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">{fechaHora(e.fecha)}</td>
                  <td className="px-4 py-2.5 text-center"><CheckDescuento clave={clave} envio={e} puedeMarcar={puedeMarcar} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Check "Descuento aplicado": marcarlo y quitarlo piden confirmación en un modal. */
function CheckDescuento({ clave, envio, puedeMarcar, conTexto = false }: { clave: string; envio: Envio; puedeMarcar: boolean; conTexto?: boolean }) {
  const [marcado, setMarcado] = useState(!!envio.descuento)
  const [guardando, iniciar] = useTransition()
  const confirmar = useConfirmar()
  const avisar = useAviso()
  const cambiar = async () => {
    const nuevo = !marcado
    const ok = await confirmar(nuevo
      ? { titulo: '¿Marcar el descuento como aplicado?', mensaje: <>A <b>{envio.nombre}</b> se le marcará el descuento como aplicado.</>, confirmar: 'Sí, marcar' }
      : { titulo: '¿Quitar el descuento aplicado?', mensaje: <>A <b>{envio.nombre}</b> se le quitará la marca de descuento aplicado.</>, confirmar: 'Sí, quitar', peligro: true })
    if (!ok) return
    iniciar(async () => {
      setMarcado(nuevo)
      const r = await marcarDescuento(clave, envio.leadId, nuevo)
      if (r.error) { setMarcado(!nuevo); avisar(`No se pudo guardar: ${r.error}`) }
    })
  }
  const detalle = marcado && envio.descuento
    ? `Marcado por ${envio.descuento.por || '—'} · ${fechaHora(envio.descuento.fecha)}`
    : !puedeMarcar ? 'Solo el super admin o un administrador puede marcarlo' : undefined
  return (
    <label className={`inline-flex items-center gap-2 ${puedeMarcar ? 'cursor-pointer' : 'cursor-default'} ${guardando ? 'opacity-60' : ''}`} title={detalle}>
      <input
        type="checkbox" checked={marcado} disabled={guardando || !puedeMarcar}
        onChange={() => { if (puedeMarcar) void cambiar() }}
        className={`h-5 w-5 accent-emerald-600 ${puedeMarcar ? 'cursor-pointer' : 'cursor-default'}`} aria-label={`Descuento aplicado a ${envio.nombre}`}
      />
      {conTexto && <span className="text-sm">Descuento aplicado{detalle && <span className="block text-xs text-slate-500">{detalle}</span>}</span>}
    </label>
  )
}

/** Una pregunta en el resumen: barras con cuántos eligieron cada opción, o la lista de respuestas escritas. */
function ResumenPregunta({ pregunta, envios }: { pregunta: PreguntaVista; envios: Envio[] }) {
  const [todas, setTodas] = useState(false)
  const respuestas = envios.map((e) => (e.valores[pregunta.id] ?? '').trim()).filter(Boolean)
  const encabezado = (
    <>
      <p className="font-medium">{pregunta.texto}</p>
      <p className="mb-3 text-xs text-slate-500">{respuestas.length} {respuestas.length === 1 ? 'respuesta' : 'respuestas'}</p>
    </>
  )
  if (!respuestas.length) return <div className="tarjeta p-5">{encabezado}<p className="text-sm text-slate-400">Sin respuestas.</p></div>

  if (pregunta.resumen === 'lista') {
    const visibles = todas ? respuestas : respuestas.slice(0, 6)
    return (
      <div className="tarjeta p-5">
        {encabezado}
        <ul className="space-y-1.5">
          {visibles.map((r, i) => <li key={i} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm whitespace-pre-wrap">{r}</li>)}
        </ul>
        {respuestas.length > 6 && (
          <button onClick={() => setTodas(!todas)} className="mt-2 text-sm font-medium text-marca-700 hover:underline">
            {todas ? 'Ver menos' : `Ver las ${respuestas.length}`}
          </button>
        )}
      </div>
    )
  }

  // Varias opciones: cada opción elegida cuenta por separado
  const conteo = new Map<string, number>()
  for (const r of respuestas) for (const v of pregunta.varias ? r.split(', ') : [r]) conteo.set(v, (conteo.get(v) ?? 0) + 1)
  const filas = [...conteo].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const maximo = filas[0]![1]
  const visibles = todas ? filas : filas.slice(0, 8)
  return (
    <div className="tarjeta p-5">
      {encabezado}
      <ul className="space-y-2">
        {visibles.map(([valor, n]) => (
          <li key={valor} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words">{valor}</span>
              <span className="shrink-0 text-xs text-slate-500 tabular-nums"><b className="text-slate-700">{n}</b> · {Math.round((n / respuestas.length) * 100)}%</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-marca-600" style={{ width: `${Math.max(2, (n / maximo) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {filas.length > 8 && (
        <button onClick={() => setTodas(!todas)} className="mt-3 text-sm font-medium text-marca-700 hover:underline">
          {todas ? 'Ver menos' : `Ver las ${filas.length} respuestas distintas`}
        </button>
      )}
    </div>
  )
}

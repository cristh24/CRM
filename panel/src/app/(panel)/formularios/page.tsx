import type { Metadata } from 'next'
import Link from '@/components/Enlace'
import { obtenerSesion } from '@/lib/sesion'
import { fechaHora } from '@/lib/formato'
import { listarFormularios } from '@/lib/respuestas-formularios'

export const metadata: Metadata = { title: 'Respuestas de formularios' }

/** Formularios de registro (Actividades y QR del asesor) con cuántos lo llenaron: cada uno abre sus respuestas. */
export default async function PaginaFormularios(props: PageProps<'/formularios'>) {
  // Todos los asesores lo ven (el RLS muestra solo las respuestas de los leads que ve cada uno)
  await obtenerSesion()
  const filtro = (await props.searchParams).ver === 'qr' ? 'qr' : (await props.searchParams).ver === 'actividad' ? 'actividad' : 'todos'
  const todos = await listarFormularios()
  const lista = todos.filter((f) => filtro === 'todos' || f.tipo === filtro)
  const pestana = (v: string, texto: string) => (
    <Link
      href={v === 'todos' ? '/formularios' : `/formularios?ver=${v}`}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${filtro === v ? 'bg-marca-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
    >
      {texto}
    </Link>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Respuestas de formularios</h1>
        <p className="text-sm text-slate-500">
          Lo que respondieron los alumnos en el formulario de cada actividad y en el QR de cada asesor, como las respuestas de un cuestionario: resumen con gráficos, una por una o en tabla.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {pestana('todos', `Todos (${todos.length})`)}
        {pestana('actividad', `Actividades (${todos.filter((f) => f.tipo === 'actividad').length})`)}
        {pestana('qr', `QR de asesores (${todos.filter((f) => f.tipo === 'qr').length})`)}
      </div>

      {!lista.length ? (
        <p className="tarjeta px-5 py-10 text-center text-sm text-slate-500">Aún no hay formularios con respuestas.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((f) => (
            <li key={f.clave}>
              <Link href={`/formularios/${f.clave}`} className="tarjeta flex h-full flex-col gap-2 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-2xl" aria-hidden>{f.tipo === 'qr' ? '🔳' : '📋'}</span>
                  <span className="flex gap-1">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{f.tipo === 'qr' ? 'QR del asesor' : 'Actividad'}</span>
                    {!f.activa && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{f.tipo === 'qr' ? 'Inactivo' : 'Cerrada'}</span>}
                  </span>
                </div>
                <p className="font-semibold">{f.nombre}</p>
                <p className="text-xs text-slate-500">{f.detalle}</p>
                <p className="mt-auto flex items-baseline justify-between gap-2 pt-2 text-sm">
                  <span><b className="text-lg text-marca-700">{f.envios}</b> {f.envios === 1 ? 'respuesta' : 'respuestas'}</span>
                  {f.ultimo && <span className="text-xs text-slate-500">Última: {fechaHora(f.ultimo)}</span>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

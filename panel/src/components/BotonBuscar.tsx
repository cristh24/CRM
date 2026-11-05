'use client'

import { abrirBuscador } from './PaletaComandos'

/** Campo de búsqueda de la barra superior (abre el buscador rápido). */
export function BotonBuscar() {
  return (
    <button
      onClick={abrirBuscador}
      className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-full border border-(--vidrio-borde) bg-(--vidrio-fondo-fuerte) px-4 text-left text-sm text-slate-400 shadow-[inset_0_0_0_1px_var(--vidrio-linea)] backdrop-blur-md transition hover:bg-superficie"
    >
      <span aria-hidden className="text-base">⌕</span>
      <span className="flex-1 truncate"><span className="sm:hidden">Buscar lead…</span><span className="hidden sm:inline">Buscar lead por nombre, celular o DNI…</span></span>
      <kbd className="tecla hidden sm:inline">Ctrl K</kbd>
    </button>
  )
}

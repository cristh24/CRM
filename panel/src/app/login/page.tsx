import type { Metadata } from 'next'
import { LogoUpeu } from '@/components/LogoUpeu'
import { FormularioLogin } from './FormularioLogin'

export const metadata: Metadata = { title: 'Ingresar' }

export default async function PaginaLogin(props: PageProps<'/login'>) {
  const { error } = await props.searchParams

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Campus Juliaca con velo azul UPeU */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url('/marca/campus-juliaca.webp')" }}
      />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-[#2c4769]/90 via-[#4a74a8]/80 to-[#6f97c9]/65" />

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <LogoUpeu variante="blanco" className="h-14" />
        </div>
        <div className="rounded-2xl border-t-4 border-marca-600 bg-superficie p-8 shadow-xl">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold">CRM de Admisión</h1>
            <p className="mt-1 text-sm text-slate-500">Campus Juliaca · Ingresa con tu usuario del panel</p>
          </div>
          {error === 'sin_perfil' && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Tu usuario no está vinculado a un asesor. Contacta al administrador.
            </p>
          )}
          {error === 'eliminado' && (
            <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Tu usuario fue dado de baja. Si es un error, contacta al administrador.
            </p>
          )}
          <FormularioLogin />
        </div>
        <p className="mt-6 text-center text-xs text-white/70">Universidad Peruana Unión · Oficina de Admisión</p>
      </div>
    </main>
  )
}

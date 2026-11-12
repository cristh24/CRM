-- "Descuento aplicado" en Respuestas de formularios: un check por alumno y formulario.
-- clave: "a-<id de la actividad>" o "q-<id del asesor>" (su QR). Quién lo marcó y cuándo queda guardado.
-- Lo marca o quita quien ve el lead (el asesor del lead y los administradores). No cambia ningún dato existente.

create table if not exists public.formulario_descuentos (
  clave       text not null check (clave ~ '^(a-[0-9]+|q-[0-9a-f-]{36})$'),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  marcado_por uuid references public.asesores (id) on delete set null default public.mi_asesor_id(),
  created_at  timestamptz not null default now(),
  primary key (clave, lead_id)
);
comment on table public.formulario_descuentos is 'Alumnos con el descuento aplicado, por formulario (Respuestas de formularios).';

alter table public.formulario_descuentos enable row level security;

drop policy if exists "formulario_descuentos: los ve quien ve el lead" on public.formulario_descuentos;
create policy "formulario_descuentos: los ve quien ve el lead" on public.formulario_descuentos
  for select to authenticated using (exists (select 1 from public.leads l where l.id = lead_id));

drop policy if exists "formulario_descuentos: marca quien ve el lead" on public.formulario_descuentos;
create policy "formulario_descuentos: marca quien ve el lead" on public.formulario_descuentos
  for insert to authenticated
  with check ((select public.mi_asesor_id()) is not null and marcado_por = (select public.mi_asesor_id())
              and exists (select 1 from public.leads l where l.id = lead_id));

drop policy if exists "formulario_descuentos: quita quien ve el lead" on public.formulario_descuentos;
create policy "formulario_descuentos: quita quien ve el lead" on public.formulario_descuentos
  for delete to authenticated
  using ((select public.mi_asesor_id()) is not null and exists (select 1 from public.leads l where l.id = lead_id));

revoke all on public.formulario_descuentos from anon, authenticated;
grant select, insert, delete on public.formulario_descuentos to authenticated;

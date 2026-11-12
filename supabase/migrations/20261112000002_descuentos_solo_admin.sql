-- "Descuento aplicado": todos lo ven (en los leads que ven), pero solo el super admin y los administradores (rol admin)
-- lo marcan o lo quitan. No cambia ningún dato existente.

create or replace function public.es_admin_o_superadmin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select superadmin or rol = 'admin' from public.asesores
                   where user_id = auth.uid() and eliminado_at is null), false)
$$;
revoke execute on function public.es_admin_o_superadmin() from public, anon;
grant execute on function public.es_admin_o_superadmin() to authenticated;

drop policy if exists "formulario_descuentos: marca quien ve el lead" on public.formulario_descuentos;
drop policy if exists "formulario_descuentos: marca el administrador" on public.formulario_descuentos;
create policy "formulario_descuentos: marca el administrador" on public.formulario_descuentos
  for insert to authenticated
  with check ((select public.es_admin_o_superadmin()) and marcado_por = (select public.mi_asesor_id())
              and exists (select 1 from public.leads l where l.id = lead_id));

drop policy if exists "formulario_descuentos: quita quien ve el lead" on public.formulario_descuentos;
drop policy if exists "formulario_descuentos: quita el administrador" on public.formulario_descuentos;
create policy "formulario_descuentos: quita el administrador" on public.formulario_descuentos
  for delete to authenticated
  using ((select public.es_admin_o_superadmin()) and exists (select 1 from public.leads l where l.id = lead_id));

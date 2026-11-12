-- "Descuento aplicado" = ya está matriculado: al marcar el check el lead pasa a lead_matriculado (y así cuenta
-- en "matriculados" de su actividad); al quitarlo vuelve al estado que tenía. El historial del lead registra el
-- cambio (trg_leads_log_estado). Los alumnos que ya tenían el check pasan a matriculado.

alter table public.formulario_descuentos add column if not exists estado_anterior public.lead_estado;
comment on column public.formulario_descuentos.estado_anterior is 'Estado del lead antes de marcar el descuento (se restaura al quitarlo).';

create or replace function public.formulario_descuento_matricula()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select estado into new.estado_anterior from public.leads where id = new.lead_id;
    update public.leads set estado = 'lead_matriculado'
    where id = new.lead_id and estado is distinct from 'lead_matriculado';
    return new;
  end if;
  -- Al quitar el check: vuelve al estado anterior si nadie lo cambió y no tiene el check en otro formulario
  if old.estado_anterior is not null and old.estado_anterior <> 'lead_matriculado'
     and not exists (select 1 from public.formulario_descuentos where lead_id = old.lead_id) then
    update public.leads set estado = old.estado_anterior
    where id = old.lead_id and estado = 'lead_matriculado';
  end if;
  return old;
end $$;
revoke execute on function public.formulario_descuento_matricula() from public, anon, authenticated;

drop trigger if exists trg_descuento_matricula_ins on public.formulario_descuentos;
create trigger trg_descuento_matricula_ins before insert on public.formulario_descuentos
  for each row execute function public.formulario_descuento_matricula();
drop trigger if exists trg_descuento_matricula_del on public.formulario_descuentos;
create trigger trg_descuento_matricula_del after delete on public.formulario_descuentos
  for each row execute function public.formulario_descuento_matricula();

-- Los que ya tenían el check
update public.formulario_descuentos d set estado_anterior = l.estado
from public.leads l where l.id = d.lead_id and d.estado_anterior is null;
update public.leads set estado = 'lead_matriculado'
where id in (select lead_id from public.formulario_descuentos) and estado is distinct from 'lead_matriculado';

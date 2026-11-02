-- Ventana de 24 h del WhatsApp de Genesys con cada asesor.
-- El número solo puede escribir a quien le escribió en las últimas 24 h: el asesor manda un "."
-- y desde ese momento recibe los avisos de sus leads. Fuera de la ventana el aviso queda pendiente
-- y le llega todo junto en su próximo ".".
alter table public.asesores
  add column if not exists ventana_whatsapp_at timestamptz;

comment on column public.asesores.ventana_whatsapp_at is
  'Último mensaje del asesor al número de Genesys: se le puede escribir por WhatsApp hasta 24 h después.';

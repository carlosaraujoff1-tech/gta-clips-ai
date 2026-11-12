-- Testes de RLS/regras de negócio. Rode após supabase_stub.sql e migrations/0001_init.sql (ver supabase/tests/run.sh).
\set ON_ERROR_STOP 0
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 1. menor bloqueado
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000009','m@x', '{"name":"Menor","birthdate":"2012-01-01"}');
-- 2. cadastros válidos (tentativa de virar admin cai para client)
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000001','c@x','{"name":"Cliente","birthdate":"1990-01-01","role":"admin"}'),
 ('00000000-0000-0000-0000-000000000002','p@x','{"name":"Pro","birthdate":"1995-01-01","role":"professional"}'),
 ('00000000-0000-0000-0000-000000000003','a@x','{"name":"Admin","birthdate":"1985-01-01"}');
update accounts set role='admin' where id='00000000-0000-0000-0000-000000000003';
insert into admin_permissions values ('00000000-0000-0000-0000-000000000003','verifications.review'),('00000000-0000-0000-0000-000000000003','reports.moderate'),('00000000-0000-0000-0000-000000000003','reports.view');
select 'T2 role escalação bloqueada:', role from accounts where id='00000000-0000-0000-0000-000000000001';

set role authenticated;
-- 3. profissional cria rascunho e tenta se autopublicar
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
insert into professionals (id, account_id, display_name, city, region) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Pro','São Paulo','Jardins');
update professionals set status='published', verification='verified' where id='10000000-0000-0000-0000-000000000001';
insert into availability (professional_id, weekday, starts, ends) values ('10000000-0000-0000-0000-000000000001', 1, '18:00','23:00');
insert into verification_requests (account_id, professional_id, legal_name, birthdate, document_type, document_path, selfie_path) values ('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Pro Silva','1995-01-01','CNH','x/doc','x/selfie');
update professionals set status='pending', verification='pending' where id='10000000-0000-0000-0000-000000000001';

-- 4. cliente não vê perfil não publicado
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select 'T4 cliente vê perfis não verificados (esperado 0):', count(*) from professionals;
select 'T4b cliente lê documentos (esperado 0):', count(*) from verification_requests;
select 'T4c cliente lê data de nasc. de outros (esperado 1 = só a dele):', count(*) from account_private;

-- 5. admin aprova
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
update verification_requests set status='approved', reviewed_by=auth.uid() where professional_id='10000000-0000-0000-0000-000000000001';
update professionals set status='published', verification='verified' where id='10000000-0000-0000-0000-000000000001';
select 'T5 auditoria registrou:', count(*) from audit_log;

-- 6. cliente reserva; duplicidade bloqueada; cliente não confirma a própria
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select 'T6 cliente vê perfil publicado (esperado 1):', count(*) from professionals;
insert into bookings (id, client_id, professional_id, starts_at, duration_min) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', now() + interval '3 days', 60);
insert into bookings (client_id, professional_id, starts_at, duration_min) values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', now() + interval '3 days' + interval '30 minutes', 60);
update bookings set status='accepted' where id='20000000-0000-0000-0000-000000000001';
-- 8a. avaliação antes de concluir: bloqueada
insert into reviews (booking_id, author_id, professional_id, rating) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',5);
-- 7. chat com mascaramento e denúncia automática
insert into conversations (id, client_id, professional_id) values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into messages (conversation_id, sender_id, body) values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','me chama no 11 98765-4321 ou pix joao@mail.com');
insert into messages (conversation_id, sender_id, body) values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','tem alguma novinha de 16 anos?');
select 'T7 mensagens:', body, masked, flagged from messages order by created_at;

-- profissional confirma e conclui
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
update bookings set status='accepted' where id='20000000-0000-0000-0000-000000000001';
update bookings set status='completed' where id='20000000-0000-0000-0000-000000000001';
select 'T6b status:', status from bookings where id='20000000-0000-0000-0000-000000000001';
-- 8b. agora avaliação permitida
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into reviews (booking_id, author_id, professional_id, rating, body) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',5,'Ótimo');
select 'T8 avaliações:', count(*) from reviews;
-- 9. bloqueio esconde perfil
insert into blocks values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
select 'T9 após bloqueio vê perfil (esperado 0):', count(*) from professionals;
-- 10. admin não apaga auditoria; denúncias urgentes visíveis
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
delete from audit_log; select 'T10 auditoria intacta:', count(*) from audit_log;
select 'T10b denúncias urgentes automáticas:', count(*) from reports where priority='urgent' and automatic;

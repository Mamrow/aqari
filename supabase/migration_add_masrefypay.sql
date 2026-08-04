-- Aqari — adds MasrefyPay (Jumhouria Bank card gateway) as a 4th Featured
-- payment option, alongside EDFali/Sadad/Moamalat. Widens the pay_method
-- check constraint on the already-created boost_payment_sessions table (see
-- migration_boost_payment_sessions.sql). Run once against the existing live
-- project. Safe to re-run.

alter table boost_payment_sessions drop constraint if exists boost_payment_sessions_pay_method_check;
alter table boost_payment_sessions add constraint boost_payment_sessions_pay_method_check
  check (pay_method in ('edfali', 'sadad', 'moamalat', 'masrefypay'));

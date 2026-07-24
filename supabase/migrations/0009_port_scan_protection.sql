-- ===================================================================
-- Adds port-scan-protection columns the redesigned editor exposes.
-- Mirrors AdsPower's "Port scan protection" + "Allowed ports" pair.
--
-- Engine wiring: when port_scan_protection = true, we pass
-- --disable-features=PrivateNetworkAccessRespectPreflightResults plus
-- --explicitly-allowed-ports if a list is supplied.
-- ===================================================================

alter table public.profiles
  add column if not exists port_scan_protection boolean default false,
  add column if not exists allowed_ports text;        -- comma-separated, e.g. "3000,8080,9001"

notify pgrst, 'reload schema';

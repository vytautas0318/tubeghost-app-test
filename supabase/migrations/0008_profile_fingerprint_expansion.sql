-- ===================================================================
-- Profile editor expansion — adds the columns the redesigned editor
-- writes (WebRTC mode, timezone/language source, screen resolution,
-- hardware-noise toggles, advanced flags, etc.).
--
-- All columns nullable: existing profiles continue to work; null is
-- read as "Real" / "Default" / "Auto" by the renderer + flag-builder.
--
-- No RLS changes — all new columns inherit the existing profiles table
-- policies (workspace-membership gated).
-- ===================================================================

alter table public.profiles
  -- Networking + privacy
  add column if not exists webrtc_mode text,                 -- forward | replace | real | disabled | proxy_udp
  add column if not exists do_not_track text,                -- default | open | close
  add column if not exists hardware_acceleration text,       -- default | open | close
  add column if not exists disable_tls_features boolean default false,
  add column if not exists launch_args text,                 -- raw extra chromium args, one per line

  -- Source-of-truth modes (null = Real)
  add column if not exists timezone_mode text,               -- real | based_on_ip | custom
  add column if not exists language_mode text,               -- real | based_on_ip | custom
  add column if not exists location_mode text,               -- real | based_on_ip | custom | block
  add column if not exists location_lat numeric,
  add column if not exists location_lon numeric,
  add column if not exists location_prompt text,             -- ask | always_allow

  -- Display
  add column if not exists display_language text,            -- e.g. en-US (Real / based_on_language / custom)
  add column if not exists display_language_mode text,       -- real | based_on_language | custom

  -- Hardware
  add column if not exists screen_resolution text,           -- e.g. "1920x1080" or null = default
  add column if not exists fonts_mode text,                  -- default | custom
  add column if not exists fonts_list text[],                -- when fonts_mode=custom
  add column if not exists device_name text,
  add column if not exists mac_address text,

  -- Hardware noise toggles (default OFF = report the machine's real output,
  -- the pixelscan/CreepJS-safe default). Each surface is opt-in per profile via
  -- the Hardware-noise UI; the launcher wires Canvas/WebGL/AudioContext/
  -- ClientRects to the engine, so a default of ON would silently mask every
  -- profile. null is also read as "Real" by the renderer + flag-builder.
  add column if not exists noise_canvas boolean default false,
  add column if not exists noise_webgl_image boolean default false,
  add column if not exists noise_audiocontext boolean default false,
  add column if not exists noise_media_device boolean default false,
  add column if not exists noise_clientrects boolean default false,
  add column if not exists noise_speechvoices boolean default false,

  -- WebGPU mode: based_on_webgl | real | disabled
  add column if not exists webgpu_mode text,

  -- Behavior
  add column if not exists random_fingerprint_on_startup boolean default false,
  add column if not exists cookies_json text;                -- raw cookie JSON pasted by user

notify pgrst, 'reload schema';

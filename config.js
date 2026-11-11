// Lyerly Neuro Tracker — connection settings.
// These values are meant to be public (they only identify your Supabase project).
// Access to the data is protected by sign-in and the database rules in supabase/01_schema.sql.
// Leave supabaseUrl empty to run the app in demo mode with data saved on this device.
window.TRACKER_CONFIG = {
  supabaseUrl: 'https://fgmgultoqsywbehriyvr.supabase.co',
  supabaseKey: 'sb_publishable_N3csC6qCdaxJFBZ6oyeI1Q_o8CG-9j5',  // publishable key (public by design)
  vapidPublicKey: 'BI353DGvbC1m8qsLgTNGiP7VoDKE01c-nVOubZX2e8f_aHrhUKwOq0erAT3Kp6CtuBa0FBWVuDxtX4M1o0XA_QY',  // for phone notifications (filled in by tools/make_keys.py)
  demoData: '../prototype/projects.json'   // only used in demo mode on this computer
};

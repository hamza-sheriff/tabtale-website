TAPTale Professional Online V10

This version is prepared for a real online backend using Supabase.

1) Create a Supabase project at https://supabase.com/
2) Open SQL Editor and run ALL contents of supabase_schema.sql.
3) In Supabase: Project Settings -> API. Copy Project URL and anon/public key.
4) Open supabase-config.js and replace:
   YOUR_SUPABASE_PROJECT_URL
   YOUR_SUPABASE_ANON_KEY
5) Open index.html locally to test, or publish the folder on GitHub Pages.
6) For email confirmation during testing, either confirm the signup email or configure the Auth email settings in Supabase.

IMPORTANT:
- The anon key is safe to put in frontend code when Row Level Security is configured as in the SQL file.
- Never put a Supabase service_role key in this project.
- Public profiles are fetched through the get_public_profile function instead of exposing direct table reads.
- For production, add a custom domain, HTTPS (GitHub Pages provides HTTPS), privacy/consent language, and consider limiting what personal information is publicly displayed.

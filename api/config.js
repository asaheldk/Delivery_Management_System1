export default function handler(_request, response) {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";
  const driverEmailDomain = process.env.DRIVER_EMAIL_DOMAIN || "drivers.invalid";

  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.status(200).json({
    configured: Boolean(supabaseUrl && supabaseAnonKey),
    supabaseUrl,
    supabaseAnonKey,
    driverEmailDomain,
  });
}

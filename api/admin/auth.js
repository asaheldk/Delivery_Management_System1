import { createClient } from "@supabase/supabase-js";

export function serverClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("서버의 Supabase 환경변수가 설정되지 않았습니다.");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireAdmin(request, response) {
  const token = String(request.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (!token) {
    response.status(401).json({ error: "관리자 로그인이 필요합니다." });
    return null;
  }

  const client = serverClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    response.status(401).json({ error: "로그인 시간이 만료되었습니다." });
    return null;
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, role, active, full_name")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "admin" || !profile.active) {
    response.status(403).json({ error: "관리자 권한이 없습니다." });
    return null;
  }
  return { client, user: data.user, profile };
}

export function normalizeEmployeeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

export function driverEmail(employeeCode) {
  const domain = process.env.DRIVER_EMAIL_DOMAIN || "drivers.invalid";
  return `${employeeCode}@${domain}`;
}

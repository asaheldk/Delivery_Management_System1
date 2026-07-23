import { requireAdmin } from "./auth.js";

const ROLES = ["super_admin","dispatch_manager","accounting_manager","field_manager","viewer"];

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "POST 요청만 가능합니다." });
  try {
    const auth = await requireAdmin(request, response, "role_manage");
    if (!auth) return;
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");
    const fullName = String(request.body?.fullName || "").trim().slice(0,40);
    const employeeCode = String(request.body?.employeeCode || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0,24);
    const role = String(request.body?.role || "viewer");
    if (!email.includes("@") || password.length < 8 || !fullName || employeeCode.length < 3 || !ROLES.includes(role)) return response.status(400).json({ error: "이메일, 아이디, 이름, 역할, 8자리 이상 비밀번호를 확인해 주세요." });
    const { data: created, error: createError } = await auth.client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { employee_code: employeeCode, full_name: fullName } });
    if (createError || !created?.user) return response.status(400).json({ error: createError?.message || "관리자 계정을 만들지 못했습니다." });
    const profile = { id: created.user.id, role, employee_code: employeeCode, full_name: fullName, phone: String(request.body?.phone || "").trim().slice(0,30), vehicle_number: null, active: true, updated_at: new Date().toISOString() };
    const { error } = await auth.client.from("profiles").insert(profile);
    if (error) { await auth.client.auth.admin.deleteUser(created.user.id); return response.status(400).json({ error: error.message }); }
    await auth.client.from("activity_logs").insert({ actor_id: auth.user.id, action: "staff_created", entity_type: "profiles", entity_id: created.user.id, detail: { role, employeeCode, fullName } });
    return response.status(201).json({ profile });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : "서버 오류가 발생했습니다." });
  }
}

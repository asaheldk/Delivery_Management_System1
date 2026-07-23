import { normalizeMenuPermissions, requireAdmin } from "./auth.js";

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
    const menuPermissions = normalizeMenuPermissions(request.body?.menuPermissions, role);
    if (!email.includes("@") || password.length < 8 || !fullName || employeeCode.length < 3 || !ROLES.includes(role)) return response.status(400).json({ error: "이메일, 아이디, 이름, 역할, 8자리 이상 비밀번호를 확인해 주세요." });
    if (!menuPermissions.length) return response.status(400).json({ error: "사용할 메뉴를 1개 이상 선택해 주세요." });
    const { data: created, error: createError } = await auth.client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { employee_code: employeeCode, full_name: fullName } });
    if (createError || !created?.user) {
      const duplicateEmail = /already|registered|exists/i.test(createError?.message || "");
      return response.status(400).json({
        error: duplicateEmail
          ? "이미 사용 중인 이메일입니다. 새 관리자는 기존 관리자와 다른 이메일을 입력해 주세요."
          : createError?.message || "관리자 계정을 만들지 못했습니다.",
      });
    }
    const profile = { id: created.user.id, role, employee_code: employeeCode, full_name: fullName, phone: String(request.body?.phone || "").trim().slice(0,30), vehicle_number: null, menu_permissions: menuPermissions, active: true, updated_at: new Date().toISOString() };
    const { error } = await auth.client.from("profiles").insert(profile);
    if (error) {
      await auth.client.auth.admin.deleteUser(created.user.id);
      const oldRoleConstraint = /profiles_role_check|profiles_role_v2_check/i.test(error.message || "");
      return response.status(400).json({
        error: oldRoleConstraint
          ? "Supabase의 예전 역할 제한이 남아 있습니다. V2.4.1 관리자 역할 긴급수정 SQL을 먼저 실행해 주세요."
          : error.message,
      });
    }
    await auth.client.from("activity_logs").insert({ actor_id: auth.user.id, action: "staff_created", entity_type: "profiles", entity_id: created.user.id, detail: { role, employeeCode, fullName, menuPermissions } });
    return response.status(201).json({ profile });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : "서버 오류가 발생했습니다." });
  }
}

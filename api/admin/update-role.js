import { ADMIN_ROLES, requireAdmin } from "./auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "POST 요청만 가능합니다." });
  try {
    const auth = await requireAdmin(request, response, "role_manage");
    if (!auth) return;
    const profileId = String(request.body?.profileId || "");
    const role = String(request.body?.role || "");
    const active = request.body?.active === true;
    if (!profileId || profileId === auth.user.id || !ADMIN_ROLES.includes(role)) return response.status(400).json({ error: "본인 계정은 여기에서 변경할 수 없으며 올바른 역할을 선택해야 합니다." });
    const { data: before } = await auth.client.from("profiles").select("*").eq("id", profileId).maybeSingle();
    if (!before || before.role === "driver") return response.status(400).json({ error: "관리자 계정만 권한을 변경할 수 있습니다." });
    const { data, error } = await auth.client.from("profiles").update({ role, active, updated_at: new Date().toISOString() }).eq("id", profileId).select().single();
    if (error) return response.status(400).json({ error: error.message });
    await auth.client.from("activity_logs").insert({ actor_id: auth.user.id, action: "staff_role_updated", entity_type: "profiles", entity_id: profileId, detail: { before: { role: before.role, active: before.active }, after: { role, active } } });
    return response.status(200).json({ profile: data });
  } catch (error) { return response.status(500).json({ error: error instanceof Error ? error.message : "서버 오류가 발생했습니다." }); }
}

import { requireAdmin } from "./auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "POST 요청만 가능합니다." });
  }

  try {
    const auth = await requireAdmin(request, response, "role_manage");
    if (!auth) return;

    const profileId = String(request.body?.profileId || "").trim();

    if (!profileId || profileId === auth.user.id) {
      return response.status(400).json({
        error: "현재 로그인한 본인 관리자 계정은 삭제할 수 없습니다.",
      });
    }

    const { data: target, error: targetError } = await auth.client
      .from("profiles")
      .select("id, role, employee_code, full_name")
      .eq("id", profileId)
      .maybeSingle();

    if (targetError || !target || target.role === "driver") {
      return response.status(404).json({
        error: "삭제할 관리자 계정을 찾지 못했습니다.",
      });
    }

    const { error: deleteError } =
      await auth.client.auth.admin.deleteUser(profileId);

    if (deleteError) {
      return response.status(400).json({
        error: deleteError.message || "관리자 계정을 삭제하지 못했습니다.",
      });
    }

    await auth.client.from("activity_logs").insert({
      actor_id: auth.user.id,
      action: "staff_deleted",
      entity_type: "profiles",
      entity_id: target.id,
      detail: {
        role: target.role,
        employeeCode: target.employee_code,
        fullName: target.full_name,
      },
    });

    return response.status(200).json({
      deleted: true,
      profileId,
      fullName: target.full_name,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "서버 오류가 발생했습니다.",
    });
  }
}

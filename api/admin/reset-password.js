import { requireAdmin } from "./auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 가능합니다." });
  }

  try {
    const auth = await requireAdmin(request, response, "account_manage");
    if (!auth) return;

    const driverId = String(request.body?.driverId || "");
    const password = String(request.body?.password || "");
    if (!driverId || password.length < 8) {
      return response
        .status(400)
        .json({ error: "새 비밀번호는 8자리 이상이어야 합니다." });
    }

    const { data: driver } = await auth.client
      .from("profiles")
      .select("id, employee_code, full_name, role")
      .eq("id", driverId)
      .maybeSingle();
    if (!driver || driver.role !== "driver") {
      return response.status(404).json({ error: "배송원을 찾지 못했습니다." });
    }

    const { error } = await auth.client.auth.admin.updateUserById(driverId, {
      password,
    });
    if (error) return response.status(400).json({ error: error.message });

    await auth.client.from("activity_logs").insert({
      actor_id: auth.user.id,
      driver_id: driverId,
      action: "password_reset",
      detail: { employeeCode: driver.employee_code },
    });
    return response.status(200).json({ ok: true });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "서버 오류가 발생했습니다.",
    });
  }
}

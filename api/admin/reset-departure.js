import { requireAdmin } from "./auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 가능합니다." });
  }

  try {
    const auth = await requireAdmin(request, response, "role_manage");
    if (!auth) return;

    const driverId = String(request.body?.driverId || "").trim();
    const workDate = String(request.body?.workDate || "").trim();
    const reason = String(request.body?.reason || "").trim().slice(0, 500);
    if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !reason) {
      return response
        .status(400)
        .json({ error: "배송원, 날짜와 승인 취소 사유를 입력해 주세요." });
    }

    const { data: current, error: currentError } = await auth.client
      .from("departure_checks")
      .select("*")
      .eq("driver_id", driverId)
      .eq("work_date", workDate)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) {
      return response
        .status(404)
        .json({ error: "출차 점검 기록을 찾지 못했습니다." });
    }

    const { error } = await auth.client
      .from("departure_checks")
      .update({
        approved: false,
        approved_by: null,
        approved_at: null,
        reject_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("driver_id", driverId)
      .eq("work_date", workDate);
    if (error) throw error;

    await auth.client.from("activity_logs").insert({
      actor_id: auth.user.id,
      driver_id: driverId,
      action: "departure_approval_reset",
      entity_type: "departure_checks",
      entity_id: driverId,
      detail: { workDate, reason, previousApprovedAt: current.approved_at },
    });

    return response.status(200).json({ ok: true });
  } catch (error) {
    return response.status(500).json({
      error:
        error instanceof Error ? error.message : "서버 오류가 발생했습니다.",
    });
  }
}

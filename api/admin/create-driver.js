import {
  driverEmail,
  normalizeEmployeeCode,
  requireAdmin,
} from "./auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 가능합니다." });
  }

  try {
    const auth = await requireAdmin(request, response);
    if (!auth) return;

    const employeeCode = normalizeEmployeeCode(request.body?.employeeCode);
    const fullName = String(request.body?.fullName || "").trim().slice(0, 40);
    const phone = String(request.body?.phone || "").trim().slice(0, 30);
    const password = String(request.body?.password || "");
    const vehicleNumber = Math.max(
      1,
      Math.min(999, Number(request.body?.vehicleNumber) || 0),
    );

    if (employeeCode.length < 3 || !fullName || !vehicleNumber) {
      return response
        .status(400)
        .json({ error: "아이디, 이름, 호차를 정확히 입력해 주세요." });
    }
    if (password.length < 8) {
      return response
        .status(400)
        .json({ error: "임시 비밀번호는 8자리 이상이어야 합니다." });
    }

    const email = driverEmail(employeeCode);
    const { data: created, error: createError } =
      await auth.client.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { employee_code: employeeCode, full_name: fullName },
      });
    if (createError || !created?.user) {
      const message = /already|registered/i.test(createError?.message || "")
        ? "이미 사용 중인 배송원 아이디입니다."
        : createError?.message || "배송원 계정을 만들지 못했습니다.";
      return response.status(400).json({ error: message });
    }

    const profile = {
      id: created.user.id,
      role: "driver",
      employee_code: employeeCode,
      full_name: fullName,
      phone,
      vehicle_number: vehicleNumber,
      active: true,
      updated_at: new Date().toISOString(),
    };
    const { error: profileError } = await auth.client
      .from("profiles")
      .insert(profile);
    if (profileError) {
      await auth.client.auth.admin.deleteUser(created.user.id);
      return response.status(400).json({ error: profileError.message });
    }

    await auth.client.from("activity_logs").insert({
      actor_id: auth.user.id,
      driver_id: created.user.id,
      action: "driver_created",
      detail: { employeeCode, fullName, vehicleNumber },
    });

    return response.status(201).json({
      driver: profile,
      login: { employeeCode, temporaryPassword: password },
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "서버 오류가 발생했습니다.",
    });
  }
}

import {
  normalizeEmployeeCode,
  normalizeMenuPermissions,
  requireAdmin,
} from "./auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return response.status(405).json({ error: "POST 요청만 가능합니다." });
  }

  try {
    const auth = await requireAdmin(request, response, "role_manage");
    if (!auth) return;

    const employeeCode = normalizeEmployeeCode(request.body?.employeeCode);
    const fullName = String(request.body?.fullName || "").trim().slice(0, 40);

    if (employeeCode.length < 3 || !fullName) {
      return response.status(400).json({
        error: "관리자 아이디는 영문 소문자·숫자 3자리 이상, 담당자 이름은 1자리 이상 입력해 주세요.",
      });
    }

    const { data: before, error: beforeError } = await auth.client
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (beforeError || !before || !["admin", "super_admin"].includes(before.role)) {
      return response.status(403).json({
        error: "최고 관리자 본인 계정만 직접 수정할 수 있습니다.",
      });
    }

    const menuPermissions = normalizeMenuPermissions(
      request.body?.menuPermissions,
      before.role,
    );

    if (!menuPermissions.includes("access")) {
      menuPermissions.push("access");
    }

    const { data, error } = await auth.client
      .from("profiles")
      .update({
        employee_code: employeeCode,
        full_name: fullName,
        menu_permissions: menuPermissions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auth.user.id)
      .select()
      .single();

    if (error) {
      const duplicateCode = /duplicate|unique|profiles_employee_code/i.test(
        error.message || "",
      );
      return response.status(400).json({
        error: duplicateCode
          ? "이미 사용 중인 관리자 아이디입니다. 다른 아이디를 입력해 주세요."
          : error.message,
      });
    }

    await auth.client.from("activity_logs").insert({
      actor_id: auth.user.id,
      action: "admin_self_updated",
      entity_type: "profiles",
      entity_id: auth.user.id,
      detail: {
        before: {
          employeeCode: before.employee_code,
          fullName: before.full_name,
          menuPermissions: before.menu_permissions,
        },
        after: {
          employeeCode,
          fullName,
          menuPermissions,
        },
      },
    });

    return response.status(200).json({ profile: data });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "서버 오류가 발생했습니다.",
    });
  }
}

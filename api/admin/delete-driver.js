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
    if (!driverId || driverId === auth.user.id) {
      return response.status(400).json({ error: "삭제할 배송원 계정을 확인해 주세요." });
    }

    const { data: driver, error: driverError } = await auth.client
      .from("profiles")
      .select("id, role, employee_code, full_name, phone, vehicle_number, active")
      .eq("id", driverId)
      .maybeSingle();

    if (driverError || !driver || driver.role !== "driver") {
      return response.status(404).json({ error: "삭제할 배송원 계정을 찾지 못했습니다." });
    }

    const { data: assignedStores } = await auth.client
      .from("stores")
      .select("id")
      .eq("assigned_driver_id", driverId);

    const { error: deleteError } =
      await auth.client.auth.admin.deleteUser(driverId);

    if (deleteError) {
      return response.status(400).json({
        error: deleteError.message || "배송원 계정을 삭제하지 못했습니다.",
      });
    }

    const storeIds = (assignedStores || []).map((store) => store.id);
    if (storeIds.length) {
      await auth.client
        .from("stores")
        .update({
          assigned_vehicle: null,
          updated_by: auth.user.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", storeIds);
    }

    await auth.client.from("activity_logs").insert({
      actor_id: auth.user.id,
      action: "driver_deleted",
      entity_type: "profiles",
      entity_id: driver.id,
      detail: {
        employeeCode: driver.employee_code,
        fullName: driver.full_name,
        phone: driver.phone,
        vehicleNumber: driver.vehicle_number,
        active: driver.active,
        unassignedStoreCount: storeIds.length,
      },
    });

    return response.status(200).json({
      deleted: true,
      driverId,
      fullName: driver.full_name,
      employeeCode: driver.employee_code,
    });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "서버 오류가 발생했습니다.",
    });
  }
}

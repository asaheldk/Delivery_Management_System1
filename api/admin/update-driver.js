import { requireAdmin } from "./auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "POST 요청만 가능합니다." });
  }
  try {
    const auth = await requireAdmin(request, response, "driver_write");
    if (!auth) return;
    const driverId = String(request.body?.driverId || "");
    const fullName = String(request.body?.fullName || "").trim().slice(0, 40);
    const phone = String(request.body?.phone || "").trim().slice(0, 30);
    const vehicleNumber = Number(request.body?.vehicleNumber);
    const active = request.body?.active === true;
    const note = String(request.body?.note || "").trim().slice(0, 300);
    if (!driverId || !fullName || !Number.isInteger(vehicleNumber) || vehicleNumber < 1 || vehicleNumber > 999) {
      return response.status(400).json({ error: "이름과 호차를 정확히 입력해 주세요." });
    }
    const { data: current, error: currentError } = await auth.client.from("profiles").select("*").eq("id", driverId).eq("role", "driver").maybeSingle();
    if (currentError || !current) return response.status(404).json({ error: "배송원 정보를 찾지 못했습니다." });
    if (active) {
      const { data: occupied } = await auth.client.from("profiles").select("id,full_name").eq("role", "driver").eq("active", true).eq("vehicle_number", vehicleNumber).neq("id", driverId).maybeSingle();
      if (occupied) return response.status(409).json({ error: `${vehicleNumber}호차는 ${occupied.full_name} 배송원에게 이미 배정되어 있습니다.` });
    }
    const changedVehicle = Number(current.vehicle_number) !== vehicleNumber;
    if (changedVehicle || !active) {
      await auth.client.from("vehicle_assignments").update({ active: false, end_date: new Date().toISOString().slice(0,10), updated_at: new Date().toISOString() }).eq("driver_id", driverId).eq("active", true);
    }
    const { data: updated, error } = await auth.client.from("profiles").update({ full_name: fullName, phone, vehicle_number: vehicleNumber, active, updated_at: new Date().toISOString() }).eq("id", driverId).select().single();
    if (error) return response.status(400).json({ error: error.message });
    if (active && changedVehicle) {
      const { error: assignError } = await auth.client.from("vehicle_assignments").insert({ driver_id: driverId, vehicle_number: vehicleNumber, start_date: new Date().toISOString().slice(0,10), active: true, note: note || `${current.vehicle_number || "미배정"}호 → ${vehicleNumber}호 변경`, created_by: auth.user.id });
      if (assignError) return response.status(409).json({ error: assignError.message });
    } else if (active && !changedVehicle) {
      const { data: existing } = await auth.client.from("vehicle_assignments").select("id").eq("driver_id", driverId).eq("active", true).maybeSingle();
      if (!existing) await auth.client.from("vehicle_assignments").insert({ driver_id: driverId, vehicle_number: vehicleNumber, start_date: new Date().toISOString().slice(0,10), active: true, note: note || "호차 배정 재활성화", created_by: auth.user.id });
    }
    await auth.client.from("activity_logs").insert({ actor_id: auth.user.id, driver_id: driverId, action: "driver_updated", entity_type: "profiles", entity_id: driverId, detail: { before: current, after: updated, note } });
    return response.status(200).json({ driver: updated });
  } catch (error) {
    return response.status(500).json({ error: error instanceof Error ? error.message : "서버 오류가 발생했습니다." });
  }
}

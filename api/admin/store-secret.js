import { requireAdmin } from "./auth.js";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "POST 요청만 가능합니다." });
  try {
    const auth = await requireAdmin(request, response, "store_secret");
    if (!auth) return;
    const storeId = String(request.body?.storeId || "");
    const action = String(request.body?.action || "get");
    if (!storeId) return response.status(400).json({ error: "거래처를 선택해 주세요." });
    if (action === "set") {
      const value = String(request.body?.value || "").trim().slice(0,200);
      const { error } = await auth.client.from("stores").update({ access_secret: value, updated_by: auth.user.id, updated_at: new Date().toISOString() }).eq("id", storeId);
      if (error) return response.status(400).json({ error: error.message });
      await auth.client.from("activity_logs").insert({ actor_id: auth.user.id, action: "store_secret_updated", entity_type: "stores", entity_id: storeId, detail: { changed: true } });
      return response.status(200).json({ saved: true });
    }
    const { data, error } = await auth.client.from("stores").select("id,name,access_secret").eq("id", storeId).single();
    if (error) return response.status(404).json({ error: "거래처 출입정보를 찾지 못했습니다." });
    await auth.client.from("activity_logs").insert({ actor_id: auth.user.id, action: "store_secret_viewed", entity_type: "stores", entity_id: storeId, detail: { storeName: data.name } });
    return response.status(200).json({ value: data.access_secret || "" });
  } catch (error) { return response.status(500).json({ error: error instanceof Error ? error.message : "서버 오류가 발생했습니다." }); }
}

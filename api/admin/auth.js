import { createClient } from "@supabase/supabase-js";

function readEnvironment() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    throw new Error("서버의 Supabase 환경변수가 설정되지 않았습니다.");
  }

  return { url, anonKey, serviceKey };
}

export function serverClient() {
  const { url, serviceKey } = readEnvironment();

  return createClient(url, serviceKey, {
    global: {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export const ADMIN_ROLES = [
  "admin",
  "super_admin",
  "dispatch_manager",
  "accounting_manager",
  "field_manager",
  "viewer",
];

export const MENU_IDS = [
  "dashboard",
  "shipments",
  "purchases",
  "drivers",
  "stores",
  "urgent",
  "products",
  "accounting",
  "access",
];

const ROLE_MENU_DEFAULTS = {
  admin: MENU_IDS,
  super_admin: MENU_IDS,
  dispatch_manager: [
    "dashboard",
    "shipments",
    "purchases",
    "drivers",
    "stores",
    "urgent",
  ],
  accounting_manager: [
    "dashboard",
    "shipments",
    "purchases",
    "products",
    "accounting",
  ],
  field_manager: [
    "dashboard",
    "shipments",
    "purchases",
    "drivers",
    "stores",
    "urgent",
  ],
  viewer: [
    "dashboard",
    "shipments",
    "purchases",
    "drivers",
    "stores",
    "urgent",
    "products",
    "accounting",
  ],
};

const ROLE_PERMISSIONS = {
  admin: ["*"],
  super_admin: ["*"],
  dispatch_manager: [
    "admin_access",
    "driver_write",
    "account_manage",
    "store_secret",
    "dispatch_write",
    "store_write",
    "urgent_write",
    "incident_write",
    "departure_write",
    "report_read",
  ],
  accounting_manager: [
    "admin_access",
    "product_write",
    "accounting_write",
    "report_read",
  ],
  field_manager: [
    "admin_access",
    "store_write",
    "urgent_write",
    "incident_write",
    "departure_write",
    "report_read",
  ],
  viewer: ["admin_access", "report_read"],
};

export function roleCan(role, permission = "admin_access") {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function defaultMenuPermissions(role) {
  return [...(ROLE_MENU_DEFAULTS[role] || ["dashboard"])];
}

export function normalizeMenuPermissions(value, role) {
  const source = Array.isArray(value) ? value : defaultMenuPermissions(role);
  const normalized = [
    ...new Set(source.map((item) => String(item || "").trim())),
  ].filter((item) => MENU_IDS.includes(item));

  return roleCan(role, "role_manage")
    ? normalized
    : normalized.filter((item) => item !== "access");
}

function signedInClient(token) {
  const { url, anonKey } = readEnvironment();

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function requireAdmin(
  request,
  response,
  permission = "admin_access",
) {
  const token = String(request.headers.authorization || "").replace(
    /^Bearer\s+/i,
    "",
  );

  if (!token) {
    response.status(401).json({ error: "관리자 로그인이 필요합니다." });
    return null;
  }

  const userClient = signedInClient(token);
  const { data: userData, error: userError } =
    await userClient.auth.getUser(token);

  if (userError || !userData?.user) {
    response.status(401).json({ error: "로그인 시간이 만료되었습니다." });
    return null;
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("id, role, active, full_name")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Admin profile lookup failed:", profileError.message);
    response.status(500).json({
      error: "관리자 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
    return null;
  }

  if (
    !ADMIN_ROLES.includes(profile?.role) ||
    profile.active !== true ||
    !roleCan(profile.role, permission)
  ) {
    response.status(403).json({ error: "관리자 권한이 없습니다." });
    return null;
  }

  return {
    client: serverClient(),
    user: userData.user,
    profile,
  };
}

export function normalizeEmployeeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
}

export function driverEmail(employeeCode) {
  const domain = process.env.DRIVER_EMAIL_DOMAIN || "drivers.invalid";
  return `${employeeCode}@${domain}`;
}

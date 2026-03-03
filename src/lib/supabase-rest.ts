type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  table: string;
};

let warnedNoSupabase = false;

function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const table = process.env.SUPABASE_CODES_TABLE?.trim() || "verification_codes";

  if (!url || !serviceRoleKey) {
    if (!warnedNoSupabase) {
      console.warn(
        "Supabase not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY). Falling back to in-memory store."
      );
      warnedNoSupabase = true;
    }
    return null;
  }

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    throw new Error(
      "SUPABASE_URL must be the Supabase Project URL (https://<project-ref>.supabase.co), not a Postgres connection string."
    );
  }

  return { url: url.replace(/\/+$/, ""), serviceRoleKey, table };
}

function parseMaybeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export type SupabaseCodeRow = {
  code: string;
  status: "unused" | "used" | "expired";
  used_at: number | string | null;
  device_id: string | null;
  expires_at: number | string;
};

export function supabaseRowToModel(row: SupabaseCodeRow): {
  code: string;
  status: "unused" | "used" | "expired";
  usedAt: number | null;
  deviceId: string | null;
  expiresAt: number;
} {
  const usedAt = parseMaybeNumber(row.used_at);
  const expiresAt = parseMaybeNumber(row.expires_at);
  if (expiresAt === null) {
    throw new Error("Invalid expires_at from Supabase");
  }

  return {
    code: row.code,
    status: row.status,
    usedAt,
    deviceId: row.device_id,
    expiresAt,
  };
}

export async function supabaseFetch(
  pathWithQuery: string,
  init: RequestInit = {}
): Promise<Response> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase not configured");
  }

  const url = `${config.url}${pathWithQuery}`;
  const headers = new Headers(init.headers);
  headers.set("apikey", config.serviceRoleKey);
  headers.set("authorization", `Bearer ${config.serviceRoleKey}`);
  if (!headers.has("accept")) headers.set("accept", "application/json");

  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
}

export function getSupabaseTablePath(): string {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase not configured");
  return `/rest/v1/${encodeURIComponent(config.table)}`;
}

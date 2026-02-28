import type { VerificationCode } from "./types";
import { getSupabaseTablePath, supabaseFetch, supabaseRowToModel } from "./supabase-rest";

type CodeStatus = VerificationCode["status"];

const memoryStore = new Map<string, VerificationCode>();
let warnedMemory = false;

function deriveStatus(code: VerificationCode, now: number = Date.now()): VerificationCode {
  if (code.status !== "unused") return code;
  if (now >= code.expiresAt) return { ...code, status: "expired" };
  return code;
}

function warnMemoryOnce(): void {
  if (warnedMemory) return;
  console.warn("Using in-memory store; data will reset on restart.");
  warnedMemory = true;
}

function normalizeCode(code: string): string {
  return code.toUpperCase().trim();
}

function resolveExpirationMinutes(options: { expirationMinutes?: number; expirationDays?: number }): number {
  const fromMinutes =
    typeof options.expirationMinutes === "number" && Number.isFinite(options.expirationMinutes)
      ? options.expirationMinutes
      : null;
  const rawMinutes = fromMinutes ?? (options.expirationDays ? options.expirationDays * 24 * 60 : 30);
  return Math.max(1, Math.min(365 * 24 * 60, Math.floor(rawMinutes)));
}

function isDuplicateInsertError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error || "");
  return /duplicate|23505|already exists|unique constraint/i.test(msg);
}

export interface FlowQueryResult<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
}

async function supabaseGetOne(code: string): Promise<VerificationCode | null> {
  const tablePath = getSupabaseTablePath();
  const params = new URLSearchParams();
  params.set("select", "code,status,used_at,device_id,expires_at");
  params.set("code", `eq.${normalizeCode(code)}`);
  params.set("limit", "1");

  const res = await supabaseFetch(`${tablePath}?${params.toString()}`, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase get failed: ${res.status} ${text}`);
  }

  const rows = (await res.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return supabaseRowToModel(rows[0] as any) as VerificationCode;
}

async function supabaseInsertMany(codes: VerificationCode[]): Promise<void> {
  const tablePath = getSupabaseTablePath();

  const body = codes.map((c) => ({
    code: normalizeCode(c.code),
    status: c.status,
    used_at: c.usedAt,
    device_id: c.deviceId,
    expires_at: c.expiresAt,
  }));

  const res = await supabaseFetch(tablePath, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed: ${res.status} ${text}`);
  }
}

async function supabaseInsertOneIgnoreDuplicate(row: VerificationCode): Promise<boolean> {
  try {
    await supabaseInsertMany([row]);
    return true;
  } catch (e) {
    if (isDuplicateInsertError(e)) return false;
    throw e;
  }
}

async function supabasePatch(
  filters: Record<string, string>,
  patch: Partial<{ status: CodeStatus; used_at: number | null; device_id: string | null }>
): Promise<VerificationCode[]> {
  const tablePath = getSupabaseTablePath();
  const params = new URLSearchParams();
  params.set("select", "code,status,used_at,device_id,expires_at");
  for (const [k, v] of Object.entries(filters)) params.set(k, v);

  const res = await supabaseFetch(`${tablePath}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase update failed: ${res.status} ${text}`);
  }

  const rows = (await res.json()) as unknown[];
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => supabaseRowToModel(r as any) as VerificationCode);
}

async function supabaseGetExistingCodes(codes: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  if (codes.length === 0) return existing;

  const tablePath = getSupabaseTablePath();
  const normalized = Array.from(new Set(codes.map(normalizeCode)));

  const chunkSize = 200;
  for (let i = 0; i < normalized.length; i += chunkSize) {
    const chunk = normalized.slice(i, i + chunkSize);
    const params = new URLSearchParams();
    params.set("select", "code");
    params.set("code", `in.(${chunk.join(",")})`);

    const res = await supabaseFetch(`${tablePath}?${params.toString()}`, { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase exists check failed: ${res.status} ${text}`);
    }

    const rows = (await res.json()) as Array<{ code?: unknown }>;
    for (const row of rows) {
      if (typeof row.code === "string") existing.add(normalizeCode(row.code));
    }
  }

  return existing;
}

async function supabaseCount(filters: Record<string, string> = {}): Promise<number> {
  const tablePath = getSupabaseTablePath();
  const params = new URLSearchParams();
  params.set("select", "code");
  params.set("limit", "1");
  for (const [k, v] of Object.entries(filters)) params.set(k, v);

  return supabaseCountWithParams(tablePath, params);
}

async function supabaseCountWithParams(tablePath: string, params: URLSearchParams): Promise<number> {
  const res = await supabaseFetch(`${tablePath}?${params.toString()}`, {
    method: "GET",
    headers: {
      prefer: "count=exact",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase count failed: ${res.status} ${text}`);
  }

  const contentRange = res.headers.get("content-range") || res.headers.get("Content-Range");
  if (!contentRange) return 0;
  const parts = contentRange.split("/");
  const totalStr = parts[1];
  const total = totalStr ? Number(totalStr) : 0;
  return Number.isFinite(total) ? total : 0;
}

export async function getVerificationCode(code: string): Promise<VerificationCode | null> {
  try {
    try {
      const v = await supabaseGetOne(code);
      return v ? deriveStatus(v) : null;
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    const v = memoryStore.get(normalizeCode(code)) ?? null;
    return v ? deriveStatus(v) : null;
  } catch (error) {
    console.error("Failed to get verification code:", error);
    return null;
  }
}

export async function setVerificationCode(code: VerificationCode): Promise<boolean> {
  try {
    try {
      await supabaseInsertMany([code]);
      return true;
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    memoryStore.set(normalizeCode(code.code), { ...code, code: normalizeCode(code.code) });
    return true;
  } catch (error) {
    console.error("Failed to set verification code:", error);
    return false;
  }
}

export async function updateCodeStatus(
  code: string,
  updates: Partial<Pick<VerificationCode, "status" | "usedAt" | "deviceId">>
): Promise<boolean> {
  try {
    try {
      const patch: Partial<{ status: CodeStatus; used_at: number | null; device_id: string | null }> = {};
      if (updates.status) patch.status = updates.status;
      if ("usedAt" in updates) patch.used_at = updates.usedAt ?? null;
      if ("deviceId" in updates) patch.device_id = updates.deviceId ?? null;

      const rows = await supabasePatch({ code: `eq.${normalizeCode(code)}` }, patch);
      return rows.length > 0;
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    const existing = memoryStore.get(normalizeCode(code));
    if (!existing) return false;
    memoryStore.set(normalizeCode(code), { ...existing, ...updates, code: existing.code });
    return true;
  } catch (error) {
    console.error("Failed to update code status:", error);
    return false;
  }
}

export async function markCodeUsed(
  code: string,
  updates: { usedAt: number; deviceId: string | null }
): Promise<boolean> {
  try {
    try {
      const rows = await supabasePatch(
        { code: `eq.${normalizeCode(code)}`, status: "eq.unused" },
        { status: "used", used_at: updates.usedAt, device_id: updates.deviceId }
      );
      return rows.length > 0;
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    const existing = memoryStore.get(normalizeCode(code));
    if (!existing || existing.status !== "unused") return false;
    memoryStore.set(normalizeCode(code), {
      ...existing,
      status: "used",
      usedAt: updates.usedAt,
      deviceId: updates.deviceId,
    });
    return true;
  } catch (error) {
    console.error("Failed to mark code as used:", error);
    return false;
  }
}

export async function getVerificationStats(): Promise<{ total: number; used: number; unused: number; expired: number }> {
  try {
    try {
      const now = Date.now();
      const [total, used, unused] = await Promise.all([
        supabaseCount(),
        supabaseCount({ status: "eq.used" }),
        supabaseCount({ status: "eq.unused", expires_at: `gt.${now}` }),
      ]);
      const expired = Math.max(0, total - used - unused);
      return { total, used, unused, expired };
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    const now = Date.now();
    let total = 0;
    let used = 0;
    let unused = 0;
    let expired = 0;
    for (const v of memoryStore.values()) {
      const derived = deriveStatus(v, now);
      total++;
      if (derived.status === "used") used++;
      if (derived.status === "unused") unused++;
      if (derived.status === "expired") expired++;
    }
    return { total, used, unused, expired };
  } catch (error) {
    console.error("Failed to get verification stats:", error);
    return { total: 0, used: 0, unused: 0, expired: 0 };
  }
}

export async function getAllVerificationCodes(
  options: { limit?: number; cursor?: string } = {}
): Promise<FlowQueryResult<VerificationCode>> {
  const limit = Math.min(options.limit ?? 100, 1000);
  const cursor = options.cursor ? normalizeCode(options.cursor) : undefined;

  try {
    try {
      const tablePath = getSupabaseTablePath();
      const params = new URLSearchParams();
      params.set("select", "code,status,used_at,device_id,expires_at");
      params.set("order", "code.asc");
      params.set("limit", String(limit + 1));
      if (cursor) params.set("code", `gt.${cursor}`);

      const res = await supabaseFetch(`${tablePath}?${params.toString()}`, { method: "GET" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Supabase list failed: ${res.status} ${text}`);
      }

      const rows = (await res.json()) as unknown[];
      const now = Date.now();
      const data = (Array.isArray(rows) ? rows : [])
        .map((r) => supabaseRowToModel(r as any) as VerificationCode)
        .map((v) => deriveStatus(v, now));

      const hasMore = data.length > limit;
      const sliced = hasMore ? data.slice(0, limit) : data;
      const nextCursor = hasMore ? sliced[sliced.length - 1]?.code : undefined;

      return { data: sliced, hasMore, cursor: nextCursor };
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    const now = Date.now();
    const all = Array.from(memoryStore.values()).sort((a, b) => a.code.localeCompare(b.code));
    const startIndex = cursor ? all.findIndex((v) => v.code > cursor) : 0;
    const safeStart = startIndex < 0 ? all.length : startIndex;
    const page = all.slice(safeStart, safeStart + limit).map((v) => deriveStatus(v, now));
    const hasMore = safeStart + limit < all.length;
    const nextCursor = hasMore ? page[page.length - 1]?.code : undefined;
    return { data: page, hasMore, cursor: nextCursor };
  } catch (error) {
    console.error("Failed to get all verification codes:", error);
    return { data: [], hasMore: false };
  }
}

export async function searchVerificationCodes(options: {
  query: string;
  limit?: number;
}): Promise<FlowQueryResult<VerificationCode>> {
  const q = normalizeCode(options.query);
  const limit = Math.min(options.limit ?? 100, 1000);

  try {
    try {
      const tablePath = getSupabaseTablePath();
      const params = new URLSearchParams();
      params.set("select", "code,status,used_at,device_id,expires_at");
      params.set("order", "code.asc");
      params.set("limit", String(limit));
      params.set("code", `ilike.*${q}*`);

      const res = await supabaseFetch(`${tablePath}?${params.toString()}`, { method: "GET" });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Supabase search failed: ${res.status} ${text}`);
      }

      const rows = (await res.json()) as unknown[];
      const now = Date.now();
      const data = (Array.isArray(rows) ? rows : [])
        .map((r) => supabaseRowToModel(r as any) as VerificationCode)
        .map((v) => deriveStatus(v, now));

      return { data, hasMore: false };
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    const now = Date.now();
    const data = Array.from(memoryStore.values())
      .map((v) => deriveStatus(v, now))
      .filter((v) => v.code.includes(q))
      .sort((a, b) => a.code.localeCompare(b.code))
      .slice(0, limit);

    return { data, hasMore: false };
  } catch (error) {
    console.error("Failed to search verification codes:", error);
    return { data: [], hasMore: false };
  }
}

async function supabaseDelete(filters: Record<string, string>): Promise<number> {
  const tablePath = getSupabaseTablePath();
  const params = new URLSearchParams();
  params.set("select", "code");
  for (const [k, v] of Object.entries(filters)) params.set(k, v);

  const res = await supabaseFetch(`${tablePath}?${params.toString()}`, {
    method: "DELETE",
    headers: { prefer: "return=representation" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase delete failed: ${res.status} ${text}`);
  }

  const rows = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(rows) ? rows.length : 0;
}

export async function deleteVerificationCodes(codes: string[]): Promise<{ deleted: number }> {
  const normalized = Array.from(new Set((codes || []).map(normalizeCode))).filter(Boolean);
  if (normalized.length === 0) return { deleted: 0 };

  try {
    try {
      const deleted = await supabaseDelete({ code: `in.(${normalized.join(",")})` });
      return { deleted };
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    let deleted = 0;
    for (const c of normalized) {
      if (memoryStore.delete(c)) deleted++;
    }
    return { deleted };
  } catch (error) {
    console.error("Failed to delete verification codes:", error);
    return { deleted: 0 };
  }
}

export async function expireVerificationCodes(codes: string[]): Promise<{ expired: number }> {
  const normalized = Array.from(new Set((codes || []).map(normalizeCode))).filter(Boolean);
  if (normalized.length === 0) return { expired: 0 };

  try {
    try {
      const rows = await supabasePatch(
        { code: `in.(${normalized.join(",")})`, status: "eq.unused" },
        { status: "expired" }
      );
      return { expired: rows.length };
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (!msg.includes("Supabase not configured")) throw e;
    }

    warnMemoryOnce();
    let expired = 0;
    for (const c of normalized) {
      const existing = memoryStore.get(c);
      if (!existing) continue;
      if (existing.status !== "unused") continue;
      memoryStore.set(c, { ...existing, status: "expired" });
      expired++;
    }
    return { expired };
  } catch (error) {
    console.error("Failed to expire verification codes:", error);
    return { expired: 0 };
  }
}

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length: number = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

export async function generateCaptchas(
  count: number,
  options: { length?: number; expirationMinutes?: number; expirationDays?: number } = {}
): Promise<{ success: boolean; generated: number; codes: string[]; message: string }> {
  const target = Math.min(Math.max(0, count | 0), 1000);
  const length = Math.max(4, Math.min(12, options.length ?? 6));
  const expirationMinutes = resolveExpirationMinutes(options);
  const expiresAt = Date.now() + expirationMinutes * 60 * 1000;

  if (target === 0) {
    return { success: true, generated: 0, codes: [], message: "未生成验证码" };
  }

  const maxAttempts = target * 10;
  const picked = new Set<string>();
  let attempts = 0;

  const toRow = (code: string): VerificationCode => ({
    code,
    status: "unused",
    usedAt: null,
    deviceId: null,
    expiresAt,
  });

  const generateCandidates = (size: number): string[] => {
    const candidates: string[] = [];
    for (let i = 0; i < size; i++) candidates.push(generateCode(length));
    return candidates;
  };

  const uniqueCandidatesFrom = (candidates: string[]): string[] =>
    Array.from(new Set(candidates.map(normalizeCode))).filter((c) => !picked.has(c));

  try {
    while (picked.size < target && attempts < maxAttempts) {
      const remaining = target - picked.size;
      const batchSize = Math.min(remaining * 2, 200);
      const uniqueCandidates = uniqueCandidatesFrom(generateCandidates(batchSize));

      let existing = new Set<string>();
      let supabaseAvailable = true;
      try {
        existing = await supabaseGetExistingCodes(uniqueCandidates);
      } catch (e) {
        const msg = (e as Error)?.message || "";
        if (!msg.includes("Supabase not configured")) throw e;
        supabaseAvailable = false;
      }

      if (!supabaseAvailable) {
        warnMemoryOnce();
        for (const c of uniqueCandidates) {
          if (memoryStore.has(c)) existing.add(c);
        }
      }

      for (const c of uniqueCandidates) {
        if (picked.size >= target) break;
        if (!existing.has(c)) picked.add(c);
      }

      attempts++;
    }

    const codes = Array.from(picked).slice(0, target);
    const rows: VerificationCode[] = codes.map(toRow);

    try {
      await supabaseInsertMany(rows);
      return {
        success: true,
        generated: rows.length,
        codes,
        message: `成功生成 ${rows.length} 个验证码`,
      };
    } catch (e) {
      const msg = (e as Error)?.message || "";
      if (msg.includes("Supabase not configured")) {
        warnMemoryOnce();

        const inserted: string[] = [];
        for (const row of rows) {
          const k = normalizeCode(row.code);
          if (memoryStore.has(k)) continue;
          memoryStore.set(k, row);
          inserted.push(k);
        }

        while (inserted.length < target && attempts < maxAttempts) {
          const next = normalizeCode(generateCode(length));
          if (picked.has(next)) {
            attempts++;
            continue;
          }
          if (memoryStore.has(next)) {
            attempts++;
            continue;
          }
          const row = toRow(next);
          memoryStore.set(next, row);
          picked.add(next);
          inserted.push(next);
          attempts++;
        }

        return {
          success: inserted.length === target,
          generated: inserted.length,
          codes: inserted,
          message: `成功生成 ${inserted.length} 个验证码`,
        };
      }

      if (!isDuplicateInsertError(e)) throw e;

      // Rare race: a candidate code got inserted elsewhere between "exists" check and insert.
      // Retry per-code and regenerate until we reach `target` inserts.
      const inserted: string[] = [];
      for (const row of rows) {
        const ok = await supabaseInsertOneIgnoreDuplicate(row);
        if (ok) inserted.push(normalizeCode(row.code));
      }

      while (inserted.length < target && attempts < maxAttempts) {
        const remaining = target - inserted.length;
        const batchSize = Math.min(remaining * 3, 200);
        const uniqueCandidates = uniqueCandidatesFrom(generateCandidates(batchSize));
        const existing = await supabaseGetExistingCodes(uniqueCandidates);

        for (const c of uniqueCandidates) {
          if (inserted.length >= target) break;
          if (existing.has(c)) continue;
          picked.add(c);
          const ok = await supabaseInsertOneIgnoreDuplicate(toRow(c));
          if (ok) inserted.push(c);
        }

        attempts++;
      }

      return {
        success: inserted.length === target,
        generated: inserted.length,
        codes: inserted,
        message: `成功生成 ${inserted.length} 个验证码`,
      };
    }
  } catch (error) {
    console.error("Failed to generate captchas:", error);
    return { success: false, generated: 0, codes: [], message: "生成验证码失败" };
  }
}

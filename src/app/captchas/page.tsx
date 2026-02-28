"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type FilterType = "all" | "unused" | "used" | "expired";

interface Captcha {
  code: string;
  status: "unused" | "used" | "expired";
  usedAt: number | null;
  deviceId: string | null;
  expiresAt: number;
}

interface Stats {
  total: number;
  unused: number;
  used: number;
  expired: number;
}

const STORAGE_KEY = "captcha_admin_secret";

function toUserFriendlyError(error: unknown, fallback: string): string {
  const msg = error instanceof Error ? error.message : String(error || "");
  if (!msg) return fallback;
  if (msg === "Failed to fetch") {
    return "网络请求失败（Failed to fetch）。如有广告拦截器/隐私插件请临时关闭后重试。";
  }
  return msg;
}

export default function CaptchasPage() {
  const [mounted, setMounted] = useState(false);
  const [allCaptchas, setAllCaptchas] = useState<Captcha[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [issuingOne, setIssuingOne] = useState(false);
  const [generateCount, setGenerateCount] = useState(1);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [adminSecret, setAdminSecret] = useState("");
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const adminSecretInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Track input focus state for browser extensions to detect
  // Also prevent default browser behavior when input is focused
  useEffect(() => {
    const handleFocusIn = () => {
      document.body.dataset.inputFocused = "true";
    };
    const handleFocusOut = () => {
      document.body.dataset.inputFocused = "";
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  // Best-effort: prevent page-level shortcut handlers from seeing keystrokes while typing secret.
  // Note: cannot override browser/OS-level shortcuts.
  const stopKeyPropagation = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    (e.nativeEvent as KeyboardEvent).stopImmediatePropagation?.();
  };

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setAdminSecret(saved);
      setAdminSecretInput(saved);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!adminSecret) {
      queueMicrotask(() => adminSecretInputRef.current?.focus());
    }
  }, [adminSecret, mounted]);

  const handleLogin = () => {
    const nextSecret = adminSecretInput.trim();
    if (!nextSecret) return;
    setMessage(null);

    (async () => {
      try {
        const res = await fetch("/api/stats", {
          headers: { "X-Admin-Secret": nextSecret },
        });

        if (!res.ok) {
          if (res.status === 401) {
            setMessage({ type: "error", text: "管理员密钥错误" });
            return;
          }
          const data = await res.json().catch(() => null);
          const msg = data?.message ? String(data.message) : "服务器错误";
          setMessage({ type: "error", text: msg });
          return;
        }

        setAdminSecret(nextSecret);
        localStorage.setItem(STORAGE_KEY, nextSecret);
      } catch (e) {
        console.error("Admin login validation failed:", e);
        setMessage({ type: "error", text: "网络错误，请稍后重试" });
      }
    })();
  };

  const handleSecretKeyDownCapture = (e: React.KeyboardEvent<HTMLInputElement>) => {
    stopKeyPropagation(e);

    if (e.key === "Enter") {
      e.preventDefault();
      handleLogin();
      return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey || (e.nativeEvent as KeyboardEvent).isComposing) return;

    // Some extensions bind bare "a" as a global hotkey and call preventDefault(),
    // which can block input. Best-effort: manually insert it.
    if (e.key !== "a" && e.key !== "A") return;

    e.preventDefault();

    const inputEl = adminSecretInputRef.current;
    const start = inputEl?.selectionStart ?? adminSecretInput.length;
    const end = inputEl?.selectionEnd ?? adminSecretInput.length;
    setAdminSecretInput((prev) => prev.slice(0, start) + e.key + prev.slice(end));

    queueMicrotask(() => {
      if (!inputEl) return;
      const caret = start + 1;
      inputEl.setSelectionRange(caret, caret);
    });
  };

  const handleLogout = () => {
    setAdminSecret("");
    setAdminSecretInput("");
    localStorage.removeItem(STORAGE_KEY);
    setAllCaptchas([]);
    setSelectedCodes(new Set());
  };

  const fetchAllCaptchas = useCallback(async () => {
    if (!adminSecret) return;
    
    setLoading(true);
    try {
      const allData: Captcha[] = [];
      let cursor: string | undefined;

      // Fetch all captchas with pagination
      do {
        const params = new URLSearchParams();
        params.set("limit", "1000");
        if (cursor) {
          params.set("cursor", cursor);
        }

        const response = await fetch(`/api/codes?${params}`, {
          headers: {
            "X-Admin-Secret": adminSecret,
          },
        });

        if (!response.ok) {
          if (response.status === 401) {
            setMessage({ type: "error", text: "管理员密钥错误" });
            handleLogout();
            return;
          }
          const errData = await response.json().catch(() => null);
          const errMsg = errData?.message ? String(errData.message) : "获取验证码失败";
          throw new Error(errMsg);
        }

        const data = await response.json().catch(() => null);
        if (!data || !Array.isArray(data.captchas) || !data.pagination) {
          throw new Error("响应格式错误");
        }

        allData.push(...data.captchas);
        cursor = data.pagination.hasMore ? data.pagination.cursor : undefined;
      } while (cursor);

      setAllCaptchas(allData);
      setSelectedCodes(new Set());
    } catch (error) {
      console.error("Failed to fetch captchas:", error);
      setMessage({ type: "error", text: toUserFriendlyError(error, "获取验证码失败") });
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    if (adminSecret) {
      fetchAllCaptchas();
    }
  }, [adminSecret, fetchAllCaptchas]);

  // Filter captchas based on status
  const normalizedSearchQuery = searchQuery.trim().toUpperCase();
  const filteredCaptchas = allCaptchas.filter((captcha) => {
    if (filter === "unused" && captcha.status !== "unused") return false;
    if (filter === "used" && captcha.status !== "used") return false;
    if (filter === "expired" && captcha.status !== "expired") return false;

    if (normalizedSearchQuery && !captcha.code.includes(normalizedSearchQuery)) return false;

    return true;
  });

  // Calculate stats
  const stats: Stats = {
    total: allCaptchas.length,
    unused: allCaptchas.filter((c) => c.status === "unused").length,
    used: allCaptchas.filter((c) => c.status === "used").length,
    expired: allCaptchas.filter((c) => c.status === "expired").length,
  };

  // Paginate
  const totalPages = Math.ceil(filteredCaptchas.length / pageSize);
  const paginatedCaptchas = filteredCaptchas.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, normalizedSearchQuery]);

  const toggleSelected = (code: string, checked: boolean) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  };

  const setPageSelection = (checked: boolean) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      for (const c of paginatedCaptchas) {
        if (checked) next.add(c.code);
        else next.delete(c.code);
      }
      return next;
    });
  };

  const pageAllSelected = paginatedCaptchas.length > 0 && paginatedCaptchas.every((c) => selectedCodes.has(c.code));
  const pageSomeSelected = paginatedCaptchas.some((c) => selectedCodes.has(c.code));

  const generateCaptchas = async () => {
    setGenerating(true);
    setMessage(null);
    
    try {
      const response = await fetch("/api/codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": adminSecret,
        },
        body: JSON.stringify({ count: generateCount }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setMessage({ type: "error", text: "管理员密钥错误" });
          handleLogout();
          return;
        }
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.message ? String(errData.message) : "生成验证码失败";
        throw new Error(errMsg);
      }

      const data = await response.json().catch(() => null);
      if (!data) throw new Error("响应格式错误");

      if (data.success) {
        setMessage({ type: "success", text: `成功生成 ${data.generated} 个验证码` });
        fetchAllCaptchas();
      } else {
        setMessage({ type: "error", text: data.message || "生成失败" });
      }
    } catch (error) {
      console.error("Failed to generate captchas:", error);
      setMessage({ type: "error", text: (error as Error)?.message || "生成验证码失败" });
    } finally {
      setGenerating(false);
    }
  };

  const issueOneCode = async () => {
    if (!adminSecret) return;

    setIssuingOne(true);
    setMessage(null);

    try {
      const response = await fetch("/api/code", {
        method: "POST",
        headers: { "X-Admin-Secret": adminSecret },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setMessage({ type: "error", text: "管理员密钥错误" });
          handleLogout();
          return;
        }
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.message ? String(errData.message) : "生成失败";
        throw new Error(errMsg);
      }

      const data = await response.json().catch(() => null);
      if (!data?.success || typeof data.code !== "string") {
        throw new Error(data?.message || "响应格式错误");
      }

      const code = String(data.code).toUpperCase();
      const expiresAt =
        typeof data.expiresAt === "number" && Number.isFinite(data.expiresAt)
          ? data.expiresAt
          : Date.now() + 30 * 60 * 1000;

      const newCaptcha: Captcha = { code, status: "unused", usedAt: null, deviceId: null, expiresAt };

      setAllCaptchas((prev) => {
        const exists = prev.some((c) => c.code === code);
        if (exists) return prev;
        const next = [...prev, newCaptcha];
        next.sort((a, b) => a.code.localeCompare(b.code));
        return next;
      });

      setMessage({ type: "success", text: `生成成功：${code}` });
    } catch (error) {
      console.error("Failed to issue one code:", error);
      setMessage({ type: "error", text: toUserFriendlyError(error, "生成失败") });
    } finally {
      setIssuingOne(false);
    }
  };

  const expireCodes = async (codes: string[]) => {
    if (!adminSecret) return;
    if (codes.length === 0) return;

    setMessage(null);
    try {
      const response = await fetch("/api/codes", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": adminSecret,
        },
        body: JSON.stringify({ action: "expire", codes }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setMessage({ type: "error", text: "管理员密钥错误" });
          handleLogout();
          return;
        }
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.message ? String(errData.message) : "操作失败";
        throw new Error(errMsg);
      }

      const data = await response.json().catch(() => null);
      if (!data?.success) throw new Error(data?.message || "操作失败");

      setAllCaptchas((prev) =>
        prev.map((c) => (codes.includes(c.code) ? { ...c, status: "expired" } : c))
      );
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        for (const c of codes) next.delete(c);
        return next;
      });
      setMessage({ type: "success", text: `已过期：${data.expired ?? 0} 条` });
    } catch (error) {
      console.error("Failed to expire codes:", error);
      setMessage({ type: "error", text: toUserFriendlyError(error, "操作失败") });
    }
  };

  const deleteCodes = async (codes: string[]) => {
    if (!adminSecret) return;
    if (codes.length === 0) return;

    const ok = window.confirm(`确认删除 ${codes.length} 条验证码？此操作不可撤销。`);
    if (!ok) return;

    setMessage(null);
    try {
      const response = await fetch("/api/codes", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": adminSecret,
        },
        body: JSON.stringify({ codes }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setMessage({ type: "error", text: "管理员密钥错误" });
          handleLogout();
          return;
        }
        const errData = await response.json().catch(() => null);
        const errMsg = errData?.message ? String(errData.message) : "删除失败";
        throw new Error(errMsg);
      }

      const data = await response.json().catch(() => null);
      if (!data?.success) throw new Error(data?.message || "删除失败");

      setAllCaptchas((prev) => prev.filter((c) => !codes.includes(c.code)));
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        for (const c of codes) next.delete(c);
        return next;
      });
      setMessage({ type: "success", text: `已删除：${data.deleted ?? 0} 条` });
    } catch (error) {
      console.error("Failed to delete codes:", error);
      setMessage({ type: "error", text: toUserFriendlyError(error, "删除失败") });
    }
  };

  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleString("zh-CN");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "unused":
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">未使用</span>;
      case "used":
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">已使用</span>;
      case "expired":
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">已过期</span>;
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">{status}</span>;
    }
  };

  if (!mounted) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold">验证码管理</h1>
        <p className="mt-4 text-gray-500">加载中...</p>
      </div>
    );
  }

  if (!adminSecret) {
    return (
      <div className="container mx-auto py-10 max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>验证码管理</CardTitle>
            <CardDescription>请输入管理员密钥登录</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >
              <div>
                <Label htmlFor="adminSecret">管理员密钥</Label>
                <Input
                  ref={adminSecretInputRef}
                  id="adminSecret"
                  name="adminSecret"
                  type="password"
                  autoComplete="current-password"
                  value={adminSecretInput}
                  onChange={(e) => setAdminSecretInput(e.target.value)}
                  onKeyDownCapture={handleSecretKeyDownCapture}
                  onKeyUpCapture={stopKeyPropagation}
                  placeholder="请输入 X-Admin-Secret"
                />
              </div>
              <Button type="submit" className="w-full">
                登录
              </Button>
            </form>
            {message && (
              <div
                className={`mt-4 p-3 rounded ${
                  message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
                }`}
              >
                {message.text}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">验证码管理</h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          退出登录
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-sm text-gray-500">总数量</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{stats.unused}</div>
              <div className="text-sm text-gray-500">未使用</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-gray-600">{stats.used}</div>
              <div className="text-sm text-gray-500">已使用</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{stats.expired}</div>
              <div className="text-sm text-gray-500">已过期</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generate Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>生成新验证码</CardTitle>
          <CardDescription>默认有效期 30 分钟（未使用自动过期）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="w-full sm:w-48">
              <Label htmlFor="generateCount">生成数量</Label>
              <Input
                id="generateCount"
                type="number"
                min={1}
                max={1000}
                value={generateCount}
                onChange={(e) => setGenerateCount(parseInt(e.target.value) || 1)}
              />
            </div>
            <Button onClick={generateCaptchas} disabled={generating} className="w-full sm:w-auto">
              {generating ? "生成中..." : "生成验证码"}
            </Button>
            <Button variant="secondary" onClick={issueOneCode} disabled={issuingOne} className="w-full sm:w-auto">
              {issuingOne ? "生成中..." : "生成 1 个并返回"}
            </Button>
            <Button variant="outline" onClick={fetchAllCaptchas} disabled={loading} className="w-full sm:w-auto">
              {loading ? "刷新中..." : "刷新"}
            </Button>
          </div>
          {message && (
            <div
              className={`mt-4 p-3 rounded ${
                message.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
              }`}
            >
              {message.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          全部 ({stats.total})
        </Button>
        <Button
          variant={filter === "unused" ? "default" : "outline"}
          onClick={() => setFilter("unused")}
        >
          未使用 ({stats.unused})
        </Button>
        <Button
          variant={filter === "used" ? "default" : "outline"}
          onClick={() => setFilter("used")}
        >
          已使用 ({stats.used})
        </Button>
        <Button
          variant={filter === "expired" ? "default" : "outline"}
          onClick={() => setFilter("expired")}
        >
          已过期 ({stats.expired})
        </Button>
      </div>

      {/* Captchas Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filter === "all" && "全部验证码"}
            {filter === "unused" && "未使用验证码"}
            {filter === "used" && "已使用验证码"}
            {filter === "expired" && "已过期验证码"}
          </CardTitle>
          <CardDescription>
            第 {currentPage} / {totalPages || 1} 页 (共 {filteredCaptchas.length} 条)
          </CardDescription>
          <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="w-full sm:w-80">
              <Label htmlFor="search">搜索</Label>
              <Input
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="输入验证码（支持模糊搜索）"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSearchQuery("")}
                disabled={!searchQuery.trim()}
              >
                清空
              </Button>
              <Button
                variant="outline"
                onClick={() => expireCodes(Array.from(selectedCodes))}
                disabled={selectedCodes.size === 0}
              >
                批量过期（{selectedCodes.size}）
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteCodes(Array.from(selectedCodes))}
                disabled={selectedCodes.size === 0}
              >
                批量删除（{selectedCodes.size}）
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && allCaptchas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : paginatedCaptchas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">暂无验证码</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 align-middle"
                          checked={pageAllSelected}
                          ref={(el) => {
                            if (!el) return;
                            el.indeterminate = !pageAllSelected && pageSomeSelected;
                          }}
                          onChange={(e) => setPageSelection(e.target.checked)}
                        />
                      </th>
                      <th className="text-left py-3 px-2 font-medium">验证码</th>
                      <th className="text-left py-3 px-2 font-medium">状态</th>
                      <th className="text-left py-3 px-2 font-medium">使用时间</th>
                      <th className="text-left py-3 px-2 font-medium">设备ID</th>
                      <th className="text-left py-3 px-2 font-medium">过期时间</th>
                      <th className="text-left py-3 px-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCaptchas.map((captcha) => (
                      <tr key={captcha.code} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={selectedCodes.has(captcha.code)}
                            onChange={(e) => toggleSelected(captcha.code, e.target.checked)}
                          />
                        </td>
                        <td className="py-3 px-2 font-mono">{captcha.code}</td>
                        <td className="py-3 px-2">{getStatusBadge(captcha.status)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600">{formatDate(captcha.usedAt)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 font-mono truncate max-w-[150px]">
                          {captcha.deviceId || "-"}
                        </td>
                        <td className="py-3 px-2 text-sm text-gray-600">{formatDate(captcha.expiresAt)}</td>
                        <td className="py-3 px-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => expireCodes([captcha.code])}
                              disabled={captcha.status !== "unused"}
                            >
                              过期
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteCodes([captcha.code])}
                            >
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    首页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    上一页
                  </Button>
                  <span className="flex items-center px-4 text-sm">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    下一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    末页
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

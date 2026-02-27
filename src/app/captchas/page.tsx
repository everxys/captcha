"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type FilterType = "all" | "unused" | "used";

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
}

const STORAGE_KEY = "captcha_admin_secret";

export default function CaptchasPage() {
  const [mounted, setMounted] = useState(false);
  const [captchas, setCaptchas] = useState<Captcha[]>([]);
  const [allCaptchas, setAllCaptchas] = useState<Captcha[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateCount, setGenerateCount] = useState(10);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [adminSecret, setAdminSecret] = useState("");
  const [adminSecretInput, setAdminSecretInput] = useState("");
  const adminSecretInputRef = useRef<HTMLInputElement | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
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
    setAdminSecret(nextSecret);
    localStorage.setItem(STORAGE_KEY, nextSecret);
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
    setCaptchas([]);
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

        const response = await fetch(`/api/captchas?${params}`, {
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
          throw new Error("获取验证码失败");
        }

        const data = await response.json();
        allData.push(...data.captchas);
        cursor = data.pagination.hasMore ? data.pagination.cursor : undefined;
      } while (cursor);

      setAllCaptchas(allData);
    } catch (error) {
      console.error("Failed to fetch captchas:", error);
      setMessage({ type: "error", text: "获取验证码失败" });
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
  const filteredCaptchas = allCaptchas.filter((captcha) => {
    if (filter === "unused") return captcha.status === "unused";
    if (filter === "used") return captcha.status === "used";
    return true;
  });

  // Calculate stats
  const stats: Stats = {
    total: allCaptchas.length,
    unused: allCaptchas.filter((c) => c.status === "unused").length,
    used: allCaptchas.filter((c) => c.status === "used").length,
  };

  // Paginate
  const totalPages = Math.ceil(filteredCaptchas.length / pageSize);
  const paginatedCaptchas = filteredCaptchas.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const generateCaptchas = async () => {
    setGenerating(true);
    setMessage(null);
    
    try {
      const response = await fetch("/api/captchas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": adminSecret,
        },
        body: JSON.stringify({ count: generateCount }),
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: `成功生成 ${data.generated} 个验证码` });
        fetchAllCaptchas();
      } else {
        setMessage({ type: "error", text: data.message || "生成失败" });
      }
    } catch (error) {
      console.error("Failed to generate captchas:", error);
      setMessage({ type: "error", text: "生成验证码失败" });
    } finally {
      setGenerating(false);
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
      <div className="grid grid-cols-3 gap-4 mb-6">
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
      </div>

      {/* Generate Form */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>生成新验证码</CardTitle>
          <CardDescription>生成指定数量的唯一验证码</CardDescription>
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
                onChange={(e) => setGenerateCount(parseInt(e.target.value) || 10)}
              />
            </div>
            <Button onClick={generateCaptchas} disabled={generating} className="w-full sm:w-auto">
              {generating ? "生成中..." : "生成验证码"}
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
      </div>

      {/* Captchas Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filter === "all" && "全部验证码"}
            {filter === "unused" && "未使用验证码"}
            {filter === "used" && "已使用验证码"}
          </CardTitle>
          <CardDescription>
            第 {currentPage} / {totalPages || 1} 页 (共 {filteredCaptchas.length} 条)
          </CardDescription>
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
                      <th className="text-left py-3 px-2 font-medium">验证码</th>
                      <th className="text-left py-3 px-2 font-medium">状态</th>
                      <th className="text-left py-3 px-2 font-medium">使用时间</th>
                      <th className="text-left py-3 px-2 font-medium">设备ID</th>
                      <th className="text-left py-3 px-2 font-medium">过期时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCaptchas.map((captcha) => (
                      <tr key={captcha.code} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2 font-mono">{captcha.code}</td>
                        <td className="py-3 px-2">{getStatusBadge(captcha.status)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600">{formatDate(captcha.usedAt)}</td>
                        <td className="py-3 px-2 text-sm text-gray-600 font-mono truncate max-w-[150px]">
                          {captcha.deviceId || "-"}
                        </td>
                        <td className="py-3 px-2 text-sm text-gray-600">{formatDate(captcha.expiresAt)}</td>
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

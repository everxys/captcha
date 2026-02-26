"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, CheckCircle, XCircle, Loader2 } from "lucide-react";

/**
 * Generate a simple device fingerprint
 */
function getDeviceId(): string {
  // Try to get existing device ID from localStorage
  let deviceId = localStorage.getItem("deviceId");
  
  if (!deviceId) {
    // Generate a simple device ID based on available browser info
    const navigatorInfo = [
      navigator.userAgent,
      navigator.language,
      new Date().getTimezoneOffset(),
      screen.width,
      screen.height,
      screen.colorDepth,
    ].join("|");
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < navigatorInfo.length; i++) {
      const char = navigatorInfo.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    deviceId = Math.abs(hash).toString(36) + Date.now().toString(36);
    localStorage.setItem("deviceId", deviceId);
  }
  
  return deviceId;
}

/**
 * Verification page component
 */
export default function VerifyPage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  
  // Handle code input - auto uppercase and limit to 6 chars
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setCode(value);
    setStatus("idle");
    setMessage("");
  };
  
  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (code.length !== 6) {
      setStatus("error");
      setMessage("请输入6位验证码");
      return;
    }
    
    setStatus("loading");
    setMessage("");
    
    try {
      const deviceId = getDeviceId();
      
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, deviceId }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Store token in localStorage
        if (data.token) {
          localStorage.setItem("authToken", data.token);
        }
        
        setStatus("success");
        setMessage("验证成功，正在跳转...");
        
        // Redirect to app after short delay
        setTimeout(() => {
          window.location.href = "/app";
        }, 1000);
      } else {
        setStatus("error");
        setMessage(data.message || "验证失败");
      }
    } catch (error) {
      console.error("Verification error:", error);
      setStatus("error");
      setMessage("网络错误，请稍后重试");
    }
  };
  
  // Get status icon
  const getStatusIcon = () => {
    switch (status) {
      case "loading":
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />;
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Shield className="h-5 w-5 text-gray-400" />;
    }
  };
  
  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-2">
            <Shield className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">
            验证码验证
          </CardTitle>
          <CardDescription className="text-center">
            请输入您购买获得的6位验证码
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">验证码</Label>
              <Input
                id="code"
                ref={inputRef}
                type="text"
                value={code}
                onChange={handleCodeChange}
                placeholder="A7X9B2"
                maxLength={6}
                className="text-center text-2xl tracking-widest font-mono"
                autoComplete="off"
                disabled={status === "loading"}
              />
            </div>
            
            {/* Status message */}
            {message && (
              <div className="flex items-center justify-center gap-2 text-sm">
                {getStatusIcon()}
                <span className={status === "error" ? "text-red-500" : status === "success" ? "text-green-500" : ""}>
                  {message}
                </span>
              </div>
            )}
          </CardContent>
          
          <CardFooter>
            <Button
              type="submit"
              className="w-full"
              disabled={status === "loading" || code.length !== 6}
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  验证中...
                </>
              ) : (
                "立即验证"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
      
      {/* Help text */}
      <p className="text-center text-sm text-gray-500 mt-4">
        验证码区分大小写，请输入完整的6位字符
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, CheckCircle } from "lucide-react";

/**
 * Protected app page
 */
export default function AppPage() {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    // Validate token on mount
    const validateToken = async () => {
      const token = localStorage.getItem("authToken");
      
      if (!token) {
        setIsValid(false);
        setIsLoading(false);
        return;
      }
      
      try {
        const response = await fetch("/api/validate-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
        
        const data = await response.json();
        setIsValid(data.valid);
        
        if (!data.valid) {
          // Clear invalid token
          localStorage.removeItem("authToken");
        }
      } catch (error) {
        console.error("Token validation error:", error);
        setIsValid(false);
      } finally {
        setIsLoading(false);
      }
    };
    
    validateToken();
  }, []);
  
  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem("authToken");
    window.location.href = "/verify";
  };
  
  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }
  
  // Invalid token - redirect to verify
  if (isValid === false) {
    useEffect(() => {
      window.location.href = "/verify";
    }, []);
    
    return null;
  }
  
  return (
    <div className="container mx-auto py-10">
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>问卷调查应用</CardTitle>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            退出
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-center py-10">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">验证成功！</h2>
            <p className="text-gray-500 mb-6">
              欢迎访问问卷调查系统
            </p>
            
            {/* TODO: Add your questionnaire content here */}
            <div className="border rounded-lg p-6 bg-gray-50">
              <p className="text-gray-400">
                在这里添加您的问卷内容...
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

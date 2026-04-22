import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import AppSidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { useUsageStore } from "@/stores/usageStore";

export default function AppLayout(): React.JSX.Element {
  const setupEventListeners = useUsageStore((s) => s.setupEventListeners);
  const fetchAll = useUsageStore((s) => s.fetchAll);

  useEffect(() => {
    fetchAll();
    const cleanup = setupEventListeners();
    return cleanup;
  }, [setupEventListeners, fetchAll]);

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

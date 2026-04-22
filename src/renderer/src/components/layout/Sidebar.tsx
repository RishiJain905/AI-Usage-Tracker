import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Server,
  Cpu,
  DollarSign,
  History,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useUsageStore } from "@/stores/usageStore";

// ─── Number formatting utilities ──────────────────────────────────────────────

function formatTokenCount(count: number): string {
  if (count < 1_000) {
    return String(count);
  }
  if (count < 1_000_000) {
    const k = count / 1_000;
    return k % 1 === 0 ? `${k.toFixed(0)}K` : `${k.toFixed(1)}K`;
  }
  const m = count / 1_000_000;
  return m % 1 === 0 ? `${m.toFixed(0)}M` : `${m.toFixed(2)}M`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

// ─── Navigation items ─────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  tooltip: string;
}

const mainNavItems: NavItem[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    path: "/",
    tooltip: "Overview — /",
  },
  {
    label: "By Provider",
    icon: Server,
    path: "/providers",
    tooltip: "By Provider — /providers",
  },
  {
    label: "By Model",
    icon: Cpu,
    path: "/models",
    tooltip: "By Model — /models",
  },
  {
    label: "Cost Tracking",
    icon: DollarSign,
    path: "/cost",
    tooltip: "Cost Tracking — /cost",
  },
  {
    label: "Usage History",
    icon: History,
    path: "/history",
    tooltip: "Usage History — /history",
  },
];

const settingsNavItem: NavItem = {
  label: "Settings",
  icon: Settings,
  path: "/settings",
  tooltip: "Settings — /settings",
};

// ─── Sidebar component ────────────────────────────────────────────────────────

function SidebarCollapseToggle(): React.JSX.Element {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-center"
      onClick={toggleSidebar}
      title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
    >
      {isCollapsed ? (
        <PanelLeft className="size-4" />
      ) : (
        <>
          <PanelLeftClose className="size-4" />
          <span className="ml-2 text-xs text-muted-foreground">Collapse</span>
        </>
      )}
    </Button>
  );
}

function SidebarSummarySection(): React.JSX.Element {
  const { state } = useSidebar();
  const aggregateTotal = useUsageStore((s) => s.aggregateTotal);
  const topModels = useUsageStore((s) => s.topModels);

  // When collapsed, hide the summary section entirely
  if (state === "collapsed") {
    return <></>;
  }

  const totalTokens = aggregateTotal?.total_tokens ?? 0;
  const totalCost = aggregateTotal?.total_cost ?? 0;
  const top3 = topModels.slice(0, 3);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Today&apos;s Summary</SidebarGroupLabel>
      <SidebarGroupContent>
        <div className="space-y-3 px-2">
          {/* Token & cost stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md bg-sidebar-accent/50 p-2">
              <div className="text-muted-foreground">Tokens</div>
              <div className="text-sm font-semibold">
                {formatTokenCount(totalTokens)}
              </div>
            </div>
            <div className="rounded-md bg-sidebar-accent/50 p-2">
              <div className="text-muted-foreground">Cost</div>
              <div className="text-sm font-semibold">
                {formatCost(totalCost)}
              </div>
            </div>
          </div>

          {/* Top 3 models */}
          {top3.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Top Models</div>
              {top3.map((model) => (
                <div
                  key={model.model_id}
                  className="flex items-center justify-between rounded-md bg-sidebar-accent/30 px-2 py-1 text-xs"
                >
                  <span className="truncate pr-2">{model.model_name}</span>
                  <span className="shrink-0 font-medium text-muted-foreground">
                    {formatTokenCount(model.total_tokens)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export default function AppSidebar(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useSidebar();

  const isActive = (path: string): boolean => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon" side="left">
      {/* Header with app title */}
      <SidebarHeader className="px-3 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Cpu className="size-4" />
          </div>
          {state === "expanded" && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">
                AI Tracker
              </span>
              <span className="text-[10px] text-muted-foreground">
                Usage Monitor
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Main navigation */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={isActive(item.path)}
                    tooltip={item.tooltip}
                    onClick={() => navigate(item.path)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Summary section */}
        <SidebarSummarySection />
      </SidebarContent>

      {/* Settings + collapse toggle at the bottom */}
      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isActive(settingsNavItem.path)}
              tooltip={settingsNavItem.tooltip}
              onClick={() => navigate(settingsNavItem.path)}
            >
              <settingsNavItem.icon />
              <span>{settingsNavItem.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarCollapseToggle />
      </SidebarFooter>
    </Sidebar>
  );
}

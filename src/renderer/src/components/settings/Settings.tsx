import { NavLink, Outlet } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SettingsNavItem {
  label: string;
  description: string;
  path: string;
}

const settingsNavItems: SettingsNavItem[] = [
  {
    label: "General",
    description: "Proxy, display, budget, and retention",
    path: "/settings/general",
  },
  {
    label: "Providers",
    description: "Manage provider endpoints",
    path: "/settings/providers",
  },
  {
    label: "API Keys",
    description: "Store and validate credentials",
    path: "/settings/api-keys",
  },
  {
    label: "About",
    description: "App info and maintenance actions",
    path: "/settings/about",
  },
];

export default function Settings(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure proxy behavior, display preferences, and provider access.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Configuration</CardTitle>
              <CardDescription>Choose a settings section.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {settingsNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      "block rounded-md border px-3 py-2 transition-colors",
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-muted",
                    )
                  }
                >
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.description}
                  </div>
                </NavLink>
              ))}
            </CardContent>
          </Card>
        </aside>

        <section>
          <Outlet />
        </section>
      </div>
    </div>
  );
}

import { Outlet } from "react-router-dom";

export default function Settings(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <Outlet />
    </div>
  );
}

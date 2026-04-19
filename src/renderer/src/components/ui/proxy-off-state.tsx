import { WifiOff } from "lucide-react";

interface ProxyOffStateProps {
  onEnable?: () => void;
}

export function ProxyOffState({
  onEnable,
}: ProxyOffStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <WifiOff className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="text-lg font-medium">Proxy is not running</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        The local proxy server is not active. Enable it to start tracking AI API
        usage.
      </p>
      {onEnable && (
        <button
          onClick={onEnable}
          className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Enable Proxy
        </button>
      )}
    </div>
  );
}

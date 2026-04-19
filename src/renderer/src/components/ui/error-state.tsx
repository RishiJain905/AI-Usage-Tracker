import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h3 className="text-lg font-medium">{title}</h3>
      {message && (
        <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  message?: string;
}

export function LoadingSpinner({
  size = "md",
  message,
}: LoadingSpinnerProps): React.JSX.Element {
  const sizeClasses = { sm: "h-4 w-4", md: "h-8 w-8", lg: "h-12 w-12" };
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8">
      <Loader2
        className={`${sizeClasses[size]} animate-spin text-muted-foreground`}
      />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

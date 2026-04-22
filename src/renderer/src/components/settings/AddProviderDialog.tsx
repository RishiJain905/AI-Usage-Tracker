import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CustomProviderAuthType =
  | "bearer"
  | "api-key-header"
  | "url-parameter"
  | "none";

export type CustomProviderResponseFormat = "openai-compatible" | "custom";

export interface CustomProviderPayload {
  id: string;
  name: string;
  baseUrl: string;
  authType: CustomProviderAuthType;
  authHeaderName: string;
  responseFormat: CustomProviderResponseFormat;
  usageFieldPath: string;
}

interface AddProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddProvider: (provider: CustomProviderPayload) => void;
  existingProviderIds?: string[];
}

interface FormState {
  id: string;
  name: string;
  baseUrl: string;
  authType: CustomProviderAuthType;
  authHeaderName: string;
  responseFormat: CustomProviderResponseFormat;
  usageFieldPath: string;
}

const DEFAULT_FORM: FormState = {
  id: "",
  name: "",
  baseUrl: "",
  authType: "bearer",
  authHeaderName: "x-api-key",
  responseFormat: "openai-compatible",
  usageFieldPath: "",
};

function slugifyProviderId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export default function AddProviderDialog({
  open,
  onOpenChange,
  onAddProvider,
  existingProviderIds = [],
}: AddProviderDialogProps): React.JSX.Element {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [didEditIdManually, setDidEditIdManually] = useState(false);

  const existingIdSet = useMemo(() => {
    return new Set(existingProviderIds.map((id) => id.toLowerCase()));
  }, [existingProviderIds]);

  const resetAndClose = (): void => {
    setForm(DEFAULT_FORM);
    setErrors({});
    setDidEditIdManually(false);
    onOpenChange(false);
  };

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      nextErrors.name = "Provider name is required.";
    }

    if (!form.id.trim()) {
      nextErrors.id = "Provider ID is required.";
    } else if (!/^[a-z0-9-]+$/.test(form.id.trim())) {
      nextErrors.id =
        "Provider ID can only include lowercase letters, numbers, and hyphens.";
    } else if (existingIdSet.has(form.id.trim().toLowerCase())) {
      nextErrors.id = "Provider ID already exists.";
    }

    if (!form.baseUrl.trim()) {
      nextErrors.baseUrl = "Base URL is required.";
    } else if (!isValidHttpUrl(form.baseUrl.trim())) {
      nextErrors.baseUrl = "Base URL must be a valid http(s) URL.";
    }

    if (
      form.authType === "api-key-header" &&
      !form.authHeaderName.trim()
    ) {
      nextErrors.authHeaderName =
        "Header name is required for API key header auth.";
    }

    if (form.responseFormat === "custom" && !form.usageFieldPath.trim()) {
      nextErrors.usageFieldPath =
        "Usage field path is required for custom response format.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (): void => {
    if (!validateForm()) return;

    onAddProvider({
      id: form.id.trim(),
      name: form.name.trim(),
      baseUrl: form.baseUrl.trim(),
      authType: form.authType,
      authHeaderName: form.authHeaderName.trim(),
      responseFormat: form.responseFormat,
      usageFieldPath: form.usageFieldPath.trim(),
    });
    resetAndClose();
  };

  const handleNameChange = (name: string): void => {
    setForm((prev) => ({
      ...prev,
      name,
      id: didEditIdManually ? prev.id : slugifyProviderId(name),
    }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          resetAndClose();
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Custom Provider</DialogTitle>
          <DialogDescription>
            Add a custom provider endpoint and auth configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="provider-name">Provider Name</Label>
            <Input
              id="provider-name"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Example: Together AI"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="provider-id">Provider ID</Label>
            <Input
              id="provider-id"
              value={form.id}
              onChange={(e) => {
                setDidEditIdManually(true);
                setForm((prev) => ({ ...prev, id: slugifyProviderId(e.target.value) }));
              }}
              placeholder="example-provider"
              aria-invalid={Boolean(errors.id)}
            />
            {errors.id && <p className="text-xs text-destructive">{errors.id}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="provider-base-url">Base URL</Label>
            <Input
              id="provider-base-url"
              value={form.baseUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, baseUrl: e.target.value }))
              }
              placeholder="https://api.example.com"
              aria-invalid={Boolean(errors.baseUrl)}
            />
            {errors.baseUrl && (
              <p className="text-xs text-destructive">{errors.baseUrl}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Authentication Type</Label>
            <Select
              value={form.authType}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  authType: value as CustomProviderAuthType,
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bearer">Bearer token</SelectItem>
                <SelectItem value="api-key-header">API key header</SelectItem>
                <SelectItem value="url-parameter">URL parameter</SelectItem>
                <SelectItem value="none">No authentication</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.authType === "api-key-header" && (
            <div className="grid gap-2">
              <Label htmlFor="auth-header-name">Auth Header Name</Label>
              <Input
                id="auth-header-name"
                value={form.authHeaderName}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    authHeaderName: e.target.value,
                  }))
                }
                placeholder="x-api-key"
                aria-invalid={Boolean(errors.authHeaderName)}
              />
              {errors.authHeaderName && (
                <p className="text-xs text-destructive">
                  {errors.authHeaderName}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label>Response Format</Label>
            <Select
              value={form.responseFormat}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  responseFormat: value as CustomProviderResponseFormat,
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai-compatible">
                  OpenAI-compatible
                </SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="usage-field-path">Usage Field Path</Label>
            <Input
              id="usage-field-path"
              value={form.usageFieldPath}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  usageFieldPath: e.target.value,
                }))
              }
              placeholder="usage.total_tokens"
              aria-invalid={Boolean(errors.usageFieldPath)}
            />
            <p className="text-xs text-muted-foreground">
              Required for custom response format. Leave empty for
              OpenAI-compatible APIs.
            </p>
            {errors.usageFieldPath && (
              <p className="text-xs text-destructive">{errors.usageFieldPath}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Add Provider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

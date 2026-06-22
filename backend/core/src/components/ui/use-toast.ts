import { useToast as useLegacyToast } from "@/hooks/useToast";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

export function useToast() {
  const { showSuccess, showError, showInfo } = useLegacyToast();

  const toast = ({ title, description, variant = "default" }: ToastOptions) => {
    const message = description ? `${title} ${description}` : title;
    if (variant === "destructive") {
      showError(message);
    } else if (title.includes("成功")) {
      showSuccess(message);
    } else if (title.includes("送信中")) {
      showInfo(message);
    } else {
      showSuccess(message);
    }
    // return fake id for compatibility
    return Math.random().toString(36);
  };

  toast.dismiss = (_id: string) => {};

  return { toast };
}

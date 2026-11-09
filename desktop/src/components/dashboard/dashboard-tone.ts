/** Shared tones of the dashboard cards, built on the existing semantic tokens. */
export type DashboardTone =
  | "default"
  | "success"
  | "warning"
  | "info"
  | "destructive"
  | "secondary"
  | "outline";

export const DASHBOARD_TONE_ICON: Record<DashboardTone, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "bg-muted text-muted-foreground",
};

export const DASHBOARD_TONE_DOT: Record<DashboardTone, string> = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
  secondary: "bg-secondary-foreground",
  outline: "bg-foreground/40",
};

export const DASHBOARD_TONE_BAR: Record<DashboardTone, string> = {
  default: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
  secondary: "bg-secondary-foreground/70",
  outline: "bg-foreground/30",
};

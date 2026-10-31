export type IconName =
  | "hash"
  | "grid"
  | "server"
  | "activity"
  | "shield"
  | "settings"
  | "search"
  | "plus"
  | "clock"
  | "alert"
  | "check"
  | "menu"
  | "x"
  | "arrow-left"
  | "arrow-up-right"
  | "copy"
  | "file"
  | "download";

export function Icon({
  name,
  className = "",
  size,
}: {
  name: IconName;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <span
      aria-hidden="true"
      className={`iw-icon iw-icon-${name} ${sizeClass} ${className}`.trim()}
    />
  );
}

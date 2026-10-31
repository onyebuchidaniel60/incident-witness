import type { ReactNode } from "react";

import { Icon } from "@/components/ui/icon";

type PlaceholderNoticeProps = {
  title?: string;
  children: ReactNode;
};

export function PlaceholderNotice({
  title = "Structural placeholder",
  children,
}: PlaceholderNoticeProps) {
  return (
    <aside className="iw-notice iw-notice-warning flex-col gap-1.5">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="alert" size="sm" />
        {title}
      </p>
      <div className="text-[11px] leading-5">{children}</div>
    </aside>
  );
}

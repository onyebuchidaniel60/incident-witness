import type { ReactNode } from "react";

type PageIntroProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function PageIntro({ eyebrow, title, description, children }: PageIntroProps) {
  return (
    <div className="max-w-3xl">
      {eyebrow ? (
        <p className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">{eyebrow}</p>
      ) : null}
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
      <p className="mt-4 text-base leading-7 text-slate-700">{description}</p>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}

import type { ReactNode } from "react";

type PageIntroProps = {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function PageIntro({ eyebrow, title, description, children }: PageIntroProps) {
  return (
    <div className="max-w-4xl">
      {eyebrow ? (
        <p className="iw-eyebrow">
          <span className="iw-eyebrow-dot" />
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-3 text-3xl leading-[1.05] text-iw-ink sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-xs leading-6 text-iw-muted sm:text-sm">{description}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

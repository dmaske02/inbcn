import type { ReactNode } from "react";

type EditorialSectionHeaderProps = Readonly<{
  id?: string;
  kicker?: string;
  title: string;
  action?: ReactNode;
}>;

export function EditorialSectionHeader({
  id,
  kicker,
  title,
  action,
}: EditorialSectionHeaderProps) {
  return (
    <header className="editorial-section-header">
      <div className="editorial-section-heading">
        {kicker ? <p className="editorial-section-kicker">{kicker}</p> : null}
        <h2 id={id}>{title}</h2>
      </div>
      <span className="editorial-section-rule" aria-hidden="true" />
      {action ? <div className="editorial-section-action">{action}</div> : null}
    </header>
  );
}

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { ReporterApplicationListItem } from "./reporter.repository";

function label(status: string): string {
  return status.replaceAll("_", " ");
}

export function ApplicationList({
  applications,
}: Readonly<{ applications: readonly ReporterApplicationListItem[] }>) {
  if (applications.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No reporter applications are available.
      </div>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {applications.map((application) => (
        <li className="rounded-md border border-border bg-card p-5" key={application.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{application.legalName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{application.displayName}</p>
            </div>
            <Badge variant={application.status === "under_review" ? "signal" : "outline"}>
              {label(application.status)}
            </Badge>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {application.submittedAt ? "Submitted" : "Created"}{" "}
            <time dateTime={application.submittedAt ?? application.createdAt}>
              {new Date(application.submittedAt ?? application.createdAt).toLocaleDateString("en-IN")}
            </time>
          </p>
          <Link
            className="mt-4 inline-flex min-h-11 items-center font-medium underline underline-offset-4"
            href={`/admin/reporters/applications/${application.id}`}
          >
            Review application
          </Link>
        </li>
      ))}
    </ul>
  );
}

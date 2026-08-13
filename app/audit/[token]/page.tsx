import { notFound } from "next/navigation";
import AuditReportView from "@/components/AuditReportView";
import { getAuditByToken } from "@/lib/audits";

// Public, read-only compliance audit report. No login: looked up by its capability
// token and rendered as a branded, human-readable document.
export const metadata = { title: "Compliance audit report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function SharedAuditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getAuditByToken(token);
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-ink">
      <AuditReportView audit={data.audit} findings={data.findings} />
    </main>
  );
}

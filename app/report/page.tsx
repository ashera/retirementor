import { getActiveConfig } from "@/lib/refdata";
import CurrentReport from "@/components/CurrentReport";

export const metadata = { title: "Scenario report", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ScenarioReportPage() {
  const config = await getActiveConfig();
  return <CurrentReport config={config} />;
}

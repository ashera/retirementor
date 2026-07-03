"use server";

import { promises as fs } from "fs";
import path from "path";
import { revalidatePath } from "next/cache";
import { getAdmin } from "@/lib/auth";
import type { MsCheck } from "@/lib/au/scenarios/moneysmart";

// Checks are stored as a committed JSON fixture — version-controlled external-
// oracle evidence that the test suite reads directly. Saving one in the admin
// tool writes the file, so it immediately becomes an external-anchored test.
const FILE = path.join(process.cwd(), "lib/au/scenarios/moneysmart-fixtures.json");

async function read(): Promise<MsCheck[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as MsCheck[];
  } catch {
    return [];
  }
}

async function write(checks: MsCheck[]): Promise<void> {
  await fs.writeFile(FILE, JSON.stringify(checks, null, 2) + "\n", "utf8");
}

export async function listMoneysmartChecks(): Promise<MsCheck[]> {
  return read();
}

export async function saveMoneysmartCheck(check: MsCheck): Promise<void> {
  if (!(await getAdmin())) throw new Error("Not authorised");
  const checks = await read();
  const i = checks.findIndex((c) => c.key === check.key);
  if (i >= 0) checks[i] = check;
  else checks.push(check);
  await write(checks);
  revalidatePath("/admin/moneysmart");
}

export async function deleteMoneysmartCheck(key: string): Promise<void> {
  if (!(await getAdmin())) throw new Error("Not authorised");
  await write((await read()).filter((c) => c.key !== key));
  revalidatePath("/admin/moneysmart");
}

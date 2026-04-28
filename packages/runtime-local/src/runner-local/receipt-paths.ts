import path from "node:path";

import { resolveRunxGlobalHomeDir } from "@runxhq/core/config";

export function defaultReceiptDir(env: NodeJS.ProcessEnv | undefined): string {
  if (env?.RUNX_RECEIPT_DIR) {
    return path.resolve(env.RUNX_RECEIPT_DIR);
  }
  return path.join(resolveRunxGlobalHomeDir(env ?? {}), "receipts");
}

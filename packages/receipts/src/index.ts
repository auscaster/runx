export const receiptsPackage = "@runx/receipts";

import crypto, {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ReceiptExecution {
  readonly status: "success" | "failure";
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly durationMs: number;
  readonly errorMessage?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AuthReceiptMetadata {
  readonly auth: {
    readonly grant_id: string;
    readonly provider: string;
    readonly connection_id: string;
    readonly scopes: readonly string[];
  };
}

export interface AgentHookReceiptMetadata {
  readonly agent_hook: {
    readonly source_type: "agent-step" | "harness-hook";
    readonly agent?: string;
    readonly hook?: string;
    readonly task?: string;
    readonly route?: string;
    readonly status: "success" | "failure";
  };
}

export interface ApprovalReceiptMetadata {
  readonly approval: {
    readonly gate_id: string;
    readonly gate_type: string;
    readonly decision: "approved" | "denied";
    readonly reason: string;
    readonly summary?: Readonly<Record<string, unknown>>;
  };
}

export interface RunnerReceiptMetadata {
  readonly runner: {
    readonly type?: string;
    readonly enforcement?: string;
    readonly attestation?: string;
    readonly provider?: string;
    readonly model?: string;
    readonly base_url?: string;
  };
}

export interface BuildLocalReceiptOptions {
  readonly receiptId?: string;
  readonly skillName: string;
  readonly sourceType: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly stdout: string;
  readonly stderr: string;
  readonly execution: ReceiptExecution;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly parentReceipt?: string;
  readonly contextFrom?: readonly string[];
  readonly artifactIds?: readonly string[];
}

export interface WriteLocalReceiptOptions extends BuildLocalReceiptOptions {
  readonly receiptDir: string;
  readonly runxHome?: string;
}

export interface ChainReceiptStep {
  readonly step_id: string;
  readonly attempt: number;
  readonly skill: string;
  readonly runner?: string;
  readonly status: "success" | "failure";
  readonly receipt_id?: string;
  readonly parent_receipt?: string;
  readonly fanout_group?: string;
  readonly retry?: {
    readonly attempt: number;
    readonly max_attempts: number;
    readonly rule_fired: string;
    readonly idempotency_key_hash?: string;
  };
  readonly context_from: readonly {
    readonly input: string;
    readonly from_step: string;
    readonly output: string;
    readonly receipt_id?: string;
  }[];
  readonly governance?: ChainReceiptGovernance;
  readonly artifact_ids?: readonly string[];
}

export interface ChainReceiptGovernance {
  readonly scope_admission?: {
    readonly status: "allow" | "deny";
    readonly requested_scopes: readonly string[];
    readonly granted_scopes: readonly string[];
    readonly grant_id?: string;
    readonly reasons?: readonly string[];
  };
}

export interface ChainReceiptSyncPoint {
  readonly group_id: string;
  readonly strategy: "all" | "any" | "quorum";
  readonly decision: "proceed" | "halt" | "pause" | "escalate";
  readonly rule_fired: string;
  readonly reason: string;
  readonly branch_count: number;
  readonly success_count: number;
  readonly failure_count: number;
  readonly required_successes: number;
  readonly branch_receipts: readonly string[];
  readonly gate?: Readonly<Record<string, unknown>>;
}

export interface BuildLocalChainReceiptOptions {
  readonly chainId: string;
  readonly chainName: string;
  readonly owner?: string;
  readonly status: "success" | "failure";
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly output: string;
  readonly steps: readonly ChainReceiptStep[];
  readonly syncPoints?: readonly ChainReceiptSyncPoint[];
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs: number;
  readonly errorMessage?: string;
}

export interface WriteLocalChainReceiptOptions extends BuildLocalChainReceiptOptions {
  readonly receiptDir: string;
  readonly runxHome?: string;
}

export type LocalReceipt = LocalSkillReceipt | LocalChainReceipt;

export type ReceiptVerificationStatus = "verified" | "unverified" | "invalid";

export interface ReceiptVerification {
  readonly status: ReceiptVerificationStatus;
  readonly reason?: string;
}

export interface VerifiedLocalReceipt {
  readonly receipt: LocalReceipt;
  readonly verification: ReceiptVerification;
}

export interface LocalSkillReceipt {
  readonly schema_version: "runx.receipt.v1";
  readonly id: string;
  readonly kind: "skill_execution";
  readonly issuer: {
    readonly type: "local";
    readonly kid: string;
    readonly public_key_sha256: string;
  };
  readonly subject: {
    readonly skill_name: string;
    readonly source_type: string;
  };
  readonly status: "success" | "failure";
  readonly started_at?: string;
  readonly completed_at?: string;
  readonly duration_ms: number;
  readonly input_hash: string;
  readonly output_hash: string;
  readonly stderr_hash?: string;
  readonly context_from: readonly string[];
  readonly parent_receipt?: string;
  readonly artifact_ids?: readonly string[];
  readonly execution: {
    readonly exit_code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly error_hash?: string;
  };
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly signature: {
    readonly alg: "Ed25519";
    readonly value: string;
  };
}

export interface LocalChainReceipt {
  readonly schema_version: "runx.receipt.v1";
  readonly id: string;
  readonly kind: "chain_execution";
  readonly issuer: {
    readonly type: "local";
    readonly kid: string;
    readonly public_key_sha256: string;
  };
  readonly subject: {
    readonly chain_name: string;
    readonly owner?: string;
  };
  readonly status: "success" | "failure";
  readonly started_at?: string;
  readonly completed_at?: string;
  readonly duration_ms: number;
  readonly input_hash: string;
  readonly output_hash: string;
  readonly error_hash?: string;
  readonly steps: readonly ChainReceiptStep[];
  readonly sync_points?: readonly ChainReceiptSyncPoint[];
  readonly signature: {
    readonly alg: "Ed25519";
    readonly value: string;
  };
}

interface LocalKeyPair {
  readonly privateKey: KeyObject;
  readonly publicKey: KeyObject;
  readonly kid: string;
  readonly publicKeySha256: string;
}

export async function writeLocalReceipt(options: WriteLocalReceiptOptions): Promise<LocalSkillReceipt> {
  const keyPair = await loadOrCreateLocalKey(options.runxHome);
  const receipt = buildLocalReceipt(options, keyPair);
  await mkdir(options.receiptDir, { recursive: true });
  await writeFile(path.join(options.receiptDir, `${receipt.id}.json`), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return receipt;
}

export async function writeLocalChainReceipt(options: WriteLocalChainReceiptOptions): Promise<LocalChainReceipt> {
  const keyPair = await loadOrCreateLocalKey(options.runxHome);
  const receipt = buildLocalChainReceipt(options, keyPair);
  await mkdir(options.receiptDir, { recursive: true });
  await writeFile(path.join(options.receiptDir, `${receipt.id}.json`), `${JSON.stringify(receipt, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return receipt;
}

export async function readLocalReceipt(receiptDir: string, id: string): Promise<LocalReceipt> {
  assertLocalReceiptId(id);
  const contents = await readFile(path.join(receiptDir, `${id}.json`), "utf8");
  return JSON.parse(contents) as LocalReceipt;
}

export async function readVerifiedLocalReceipt(
  receiptDir: string,
  id: string,
  runxHome = defaultRunxHome(),
): Promise<VerifiedLocalReceipt> {
  const receipt = await readLocalReceipt(receiptDir, id);
  return {
    receipt,
    verification: await verifyLocalReceiptFromLocalKey(receipt, runxHome),
  };
}

export async function listLocalReceipts(receiptDir: string): Promise<readonly LocalReceipt[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(receiptDir);
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }

  const receipts = await Promise.all(
    entries
      .filter((entry) => /^(rx|cx)_[A-Za-z0-9_-]+\.json$/.test(entry))
      .map(async (entry) => JSON.parse(await readFile(path.join(receiptDir, entry), "utf8")) as LocalReceipt),
  );
  return receipts.sort((left, right) => receiptTimestamp(right).localeCompare(receiptTimestamp(left)));
}

export async function listVerifiedLocalReceipts(
  receiptDir: string,
  runxHome = defaultRunxHome(),
): Promise<readonly VerifiedLocalReceipt[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(receiptDir);
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }

  const receipts = await Promise.all(
    entries
      .filter((entry) => /^(rx|cx)_[A-Za-z0-9_-]+\.json$/.test(entry))
      .map(async (entry) => readVerifiedLocalReceipt(receiptDir, entry.slice(0, -".json".length), runxHome)),
  );
  return receipts.sort((left, right) => receiptTimestamp(right.receipt).localeCompare(receiptTimestamp(left.receipt)));
}

export function buildLocalReceipt(options: BuildLocalReceiptOptions, keyPair: LocalKeyPair): LocalSkillReceipt {
  const unsignedBase = {
    schema_version: "runx.receipt.v1" as const,
    kind: "skill_execution" as const,
    issuer: {
      type: "local" as const,
      kid: keyPair.kid,
      public_key_sha256: keyPair.publicKeySha256,
    },
    subject: {
      skill_name: options.skillName,
      source_type: options.sourceType,
    },
    status: options.execution.status,
    started_at: options.startedAt,
    completed_at: options.completedAt,
    duration_ms: options.execution.durationMs,
    input_hash: hashStable(options.inputs),
    output_hash: hashString(options.stdout),
    stderr_hash: options.stderr ? hashString(options.stderr) : undefined,
    context_from: options.contextFrom ?? [],
    parent_receipt: options.parentReceipt,
    artifact_ids: options.artifactIds && options.artifactIds.length > 0 ? options.artifactIds : undefined,
    execution: {
      exit_code: options.execution.exitCode,
      signal: options.execution.signal,
      error_hash: options.execution.errorMessage ? hashString(options.execution.errorMessage) : undefined,
    },
    metadata: options.execution.metadata ? redactReceiptMetadata(options.execution.metadata) : undefined,
  };
  const id = options.receiptId ?? uniqueReceiptId("rx");
  const signedPayload = {
    ...unsignedBase,
    id,
  };
  const signature = signPayload(stableStringify(signedPayload), keyPair.privateKey);

  return {
    ...signedPayload,
    signature: {
      alg: "Ed25519",
      value: signature,
    },
  };
}

export function buildLocalChainReceipt(
  options: BuildLocalChainReceiptOptions,
  keyPair: LocalKeyPair,
): LocalChainReceipt {
  const signedPayload = {
    schema_version: "runx.receipt.v1" as const,
    id: options.chainId,
    kind: "chain_execution" as const,
    issuer: {
      type: "local" as const,
      kid: keyPair.kid,
      public_key_sha256: keyPair.publicKeySha256,
    },
    subject: {
      chain_name: options.chainName,
      owner: options.owner,
    },
    status: options.status,
    started_at: options.startedAt,
    completed_at: options.completedAt,
    duration_ms: options.durationMs,
    input_hash: hashStable(options.inputs),
    output_hash: hashString(options.output),
    error_hash: options.errorMessage ? hashString(options.errorMessage) : undefined,
    steps: options.steps,
    sync_points: options.syncPoints && options.syncPoints.length > 0 ? options.syncPoints : undefined,
  };
  const signature = signPayload(stableStringify(signedPayload), keyPair.privateKey);

  return {
    ...signedPayload,
    signature: {
      alg: "Ed25519",
      value: signature,
    },
  };
}

export async function loadOrCreateLocalKey(runxHome = defaultRunxHome()): Promise<LocalKeyPair> {
  const keyDir = path.join(runxHome, "keys");
  const privateKeyPath = path.join(keyDir, "local-ed25519-private.pem");
  const publicKeyPath = path.join(keyDir, "local-ed25519-public.pem");

  // Try to load existing keys
  const loaded = await tryLoadKeyPair(privateKeyPath, publicKeyPath);
  if (loaded) return loaded;

  // Keys don't exist — generate new ones
  try {
    await mkdir(keyDir, { recursive: true });
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    await Promise.all([
      writeFile(privateKeyPath, privatePem, { flag: "wx", mode: 0o600 }),
      writeFile(publicKeyPath, publicPem, { flag: "wx", mode: 0o644 }),
    ]);
    return keyPairFromPem(privatePem, publicPem);
  } catch (writeError: unknown) {
    // Another process created the keys concurrently — read what they wrote
    if (isNodeError(writeError) && writeError.code === "EEXIST") {
      const retried = await tryLoadKeyPair(privateKeyPath, publicKeyPath);
      if (retried) return retried;
    }
    throw new Error(
      `runx signing key creation failed at ${privateKeyPath}: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
    );
  }
}

async function tryLoadKeyPair(privatePath: string, publicPath: string, retries = 2): Promise<LocalKeyPair | null> {
  try {
    const [privatePem, publicPem] = await Promise.all([
      readFile(privatePath, "utf8"),
      readFile(publicPath, "utf8"),
    ]);

    if (process.platform !== "win32") {
      const info = await stat(privatePath);
      const mode = info.mode & 0o777;
      if (mode !== 0o600) {
        process.stderr.write(
          `warning: ${privatePath} has permissions ${mode.toString(8)}, expected 600\n`,
        );
      }
    }

    return keyPairFromPem(privatePem, publicPem);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      // A concurrent writer may have created one key file but not both yet.
      // Brief retry before concluding keys don't exist.
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 10));
        return tryLoadKeyPair(privatePath, publicPath, retries - 1);
      }
      return null;
    }
    throw new Error(
      `runx signing key unreadable at ${privatePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function verifyLocalReceipt(receipt: LocalReceipt, publicKey: KeyObject): boolean {
  const { signature, ...signedPayload } = receipt;
  return verify(null, Buffer.from(stableStringify(signedPayload)), publicKey, fromBase64Url(signature.value));
}

async function verifyLocalReceiptFromLocalKey(receipt: LocalReceipt, runxHome: string): Promise<ReceiptVerification> {
  if (receipt.schema_version !== "runx.receipt.v1" || receipt.signature?.alg !== "Ed25519") {
    return {
      status: "unverified",
      reason: "unsupported_receipt_version_or_signature_algorithm",
    };
  }

  const publicKey = await loadLocalPublicKey(runxHome);
  if (!publicKey) {
    return {
      status: "unverified",
      reason: "local_public_key_missing",
    };
  }

  if (receipt.issuer.public_key_sha256 !== publicKey.publicKeySha256) {
    return {
      status: "unverified",
      reason: "local_public_key_mismatch",
    };
  }

  try {
    return verifyLocalReceipt(receipt, publicKey.publicKey)
      ? { status: "verified" }
      : { status: "invalid", reason: "signature_mismatch" };
  } catch {
    return { status: "invalid", reason: "signature_mismatch" };
  }
}

async function loadLocalPublicKey(runxHome: string): Promise<Pick<LocalKeyPair, "publicKey" | "publicKeySha256"> | undefined> {
  const publicKeyPath = path.join(runxHome, "keys", "local-ed25519-public.pem");
  try {
    const publicPem = await readFile(publicKeyPath, "utf8");
    const publicKey = createPublicKey(publicPem);
    const publicDer = publicKey.export({ format: "der", type: "spki" });
    return {
      publicKey,
      publicKeySha256: createHash("sha256").update(publicDer).digest("hex"),
    };
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
}

export function hashStable(value: unknown): string {
  return hashString(stableStringify(value));
}

export function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function uniqueReceiptId(prefix: "rx" | "cx"): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function redactReceiptMetadata(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return redactValue(value) as Readonly<Record<string, unknown>>;
}

function assertLocalReceiptId(id: string): void {
  if (!/^(rx|cx)_[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid receipt id '${id}'.`);
  }
}

function keyPairFromPem(privatePem: string, publicPem: string): LocalKeyPair {
  const privateKey = createPrivateKey(privatePem);
  const publicKey = createPublicKey(publicPem);
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const publicKeySha256 = createHash("sha256").update(publicDer).digest("hex");

  return {
    privateKey,
    publicKey,
    kid: `local_${publicKeySha256.slice(0, 16)}`,
    publicKeySha256,
  };
}

function signPayload(payload: string, privateKey: KeyObject): string {
  return toBase64Url(sign(null, Buffer.from(payload), privateKey));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.entries(record)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      isSecretKey(key) ? "[redacted]" : redactValue(entryValue),
    ]),
  );
}

function isSecretKey(key: string): boolean {
  return /(access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|password|raw[_-]?secret|raw[_-]?token)/i.test(key);
}

function receiptTimestamp(receipt: LocalReceipt): string {
  return receipt.completed_at ?? receipt.started_at ?? "";
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function defaultRunxHome(): string {
  return process.env.RUNX_HOME ?? path.join(os.homedir(), ".runx");
}

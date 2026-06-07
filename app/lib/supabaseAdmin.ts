import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SERVER_STORAGE_KEY_ERROR = "Server storage key is not configured.";
export const IMAGES_BUCKET_NOT_FOUND_ERROR =
  "Storage bucket 'images' was not found.";

export class SupabaseAdminStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseAdminStorageError";
  }
}

let cachedAdminClient: SupabaseClient | null = null;
let cachedAdminConfig: { url: string; serviceRoleKey: string } | null = null;

export function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new SupabaseAdminStorageError(SERVER_STORAGE_KEY_ERROR);
  }

  if (!url) {
    throw new SupabaseAdminStorageError("Supabase URL is not configured.");
  }

  if (
    !cachedAdminClient ||
    cachedAdminConfig?.url !== url ||
    cachedAdminConfig.serviceRoleKey !== serviceRoleKey
  ) {
    cachedAdminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    cachedAdminConfig = { url, serviceRoleKey };
  }

  return cachedAdminClient;
}

export async function assertStorageBucketExists(
  supabaseAdmin: SupabaseClient,
  bucketName: string
) {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();

  if (error) {
    throw new SupabaseAdminStorageError(
      error.message || "Storage bucket check failed."
    );
  }

  if (!buckets?.some((bucket) => bucket.name === bucketName)) {
    throw new SupabaseAdminStorageError(IMAGES_BUCKET_NOT_FOUND_ERROR);
  }
}

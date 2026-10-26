"use server";

import { revalidatePath } from "next/cache";
import { serverApi, ApiClientError } from "@/lib/api/server";
import type { FirmSettings } from "@/lib/types";

export interface SettingsActionResult {
  ok: boolean;
  error?: string;
}

export async function updateFirmSettingsAction(
  patch: Partial<FirmSettings> & { name?: string },
): Promise<SettingsActionResult> {
  const { name, ...settings } = patch;
  try {
    await serverApi("/firms/current", {
      method: "PATCH",
      body: JSON.stringify({
        ...(name ? { name } : {}),
        ...(Object.keys(settings).length > 0 ? { settings } : {}),
      }),
    });
    revalidatePath("/settings");
    revalidatePath("/audit");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof ApiClientError
          ? error.message
          : "The request could not be completed.",
    };
  }
}
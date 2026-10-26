"use server";

import { redirect } from "next/navigation";
import { serverApi, ApiClientError } from "@/lib/api/server";
import type { AuthState } from "@/app/(auth)/actions";

export async function createFirmAction(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();

  if (name.length < 2) return { error: "Enter your firm's name." };
  if (!/^[a-z0-9-]{3,63}$/.test(slug)) {
    return {
      error:
        "Choose a workspace address with 3-63 lowercase letters, numbers or hyphens.",
    };
  }

  try {
    await serverApi("/firms", {
      method: "POST",
      body: JSON.stringify({ name, slug }),
    });
  } catch (error) {
    if (error instanceof ApiClientError) return { error: error.message };
    return { error: "Unable to create the firm workspace." };
  }

  redirect("/cases");
}
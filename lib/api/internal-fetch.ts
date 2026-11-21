export async function internalFetch(url: URL, init: RequestInit) {
  if (process.env.BRIEFLOCK_RUNTIME === "cloudflare") {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const service = getCloudflareContext().env.WORKER_SELF_REFERENCE;
    if (!service) throw new Error("The BriefLock Worker service binding is missing.");
    const response = await service.fetch(new Request(url, { ...init, redirect: "manual" }));
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error("The internal API returned an unexpected redirect.");
    }
    return response;
  }

  return fetch(url, init);
}

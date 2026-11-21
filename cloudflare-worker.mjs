import nextWorker from "./.open-next/worker.js";

const jobs = {
  "03:00": "audit-verify",
  "04:00": "retention",
  "04:15": "notifications",
  "05:00": "audit-export",
};

const worker = {
  fetch: nextWorker.fetch,

  async scheduled(event, env) {
    const job = jobs[new Date(event.scheduledTime).toISOString().slice(11, 16)];
    if (!job) return;
    if (!env.CRON_SECRET) throw new Error("BriefLock cron configuration is missing.");

    const response = await env.WORKER_SELF_REFERENCE.fetch(
      new Request(new URL(`/api/v1/jobs/${job}`, env.NEXT_PUBLIC_APP_URL), {
        redirect: "manual",
        headers: { authorization: `Bearer ${env.CRON_SECRET}` },
      }),
    );
    await response.body?.cancel();
    if (!response.ok) throw new Error(`BriefLock job ${job} returned ${response.status}.`);
  },
};

export default worker;

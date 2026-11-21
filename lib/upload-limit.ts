const configuredLimit = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB);
const hasConfiguredLimit =
  Number.isInteger(configuredLimit) && configuredLimit > 0 && configuredLimit <= 100;

export const MAX_UPLOAD_MB = hasConfiguredLimit ? configuredLimit : 100;
export const MAX_UPLOAD_BYTES = hasConfiguredLimit ? MAX_UPLOAD_MB * 1_000_000 : 104_857_600;
export const MAX_UPLOAD_MESSAGE = `The maximum document size is ${MAX_UPLOAD_MB} MB.`;

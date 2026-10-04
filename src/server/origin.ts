type OriginEnvironment = Record<string, string | undefined>;

export function appOrigin(variables: OriginEnvironment = process.env) {
  const configured = variables.APP_ORIGIN?.trim();
  const hostname = (
    (variables.VERCEL_ENV === "production"
      ? variables.VERCEL_PROJECT_PRODUCTION_URL
      : variables.VERCEL_URL) || variables.RENDER_EXTERNAL_HOSTNAME
  )?.trim();
  if (!configured && hostname && !/^[a-z\d.-]+$/i.test(hostname))
    throw new Error("The deployment hostname must contain only a hostname.");
  const url = new URL(
    configured || (hostname ? `https://${hostname}` : "http://localhost:3000"),
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error(
      "APP_ORIGIN must be an HTTP(S) origin without a path or credentials.",
    );
  return url.origin;
}

// Called by the production launcher, not during next build.
export function productionOrigin(variables: OriginEnvironment = process.env) {
  if (
    !variables.APP_ORIGIN?.trim() &&
    !variables.RENDER_EXTERNAL_HOSTNAME?.trim() &&
    !variables.VERCEL_URL?.trim() &&
    !variables.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  )
    throw new Error(
      "Set APP_ORIGIN or a trusted deployment hostname before starting production.",
    );
  const origin = appOrigin(variables);
  if (!origin.startsWith("https://"))
    throw new Error("Production APP_ORIGIN must use HTTPS.");
  return origin;
}

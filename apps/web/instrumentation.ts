export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { webConfiguration } = await import("./lib/environment");
    webConfiguration();
  }
}

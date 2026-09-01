export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !specifier.endsWith(".ts") && !specifier.endsWith(".tsx")) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Let Node produce its normal resolution error when this is not a local
      // TypeScript module (for example, a package import).
    }
  }
  return nextResolve(specifier, context);
}

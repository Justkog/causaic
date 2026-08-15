export function createRedactor(secrets: readonly string[]) {
  const values = secrets.filter((secret) => secret.length > 0);
  return (message: string): string =>
    values.reduce(
      (redacted, secret) => redacted.replaceAll(secret, '[redacted]'),
      message,
    );
}

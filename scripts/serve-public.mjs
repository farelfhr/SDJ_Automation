import { createPublicProxy } from './public-proxy.mjs';

const apiPort = Number(process.env.API_PORT ?? 3000);
const proxyPort = Number(process.env.PUBLIC_PROXY_PORT ?? 3001);
const server = createPublicProxy(apiPort);
server.listen(proxyPort, '127.0.0.1', () => {
  process.stdout.write(`SDJ public proxy listening on 127.0.0.1:${proxyPort}\n`);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });

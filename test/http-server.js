// Keep SuperTest's request address in the same family as the listening socket. Its automatic
// server path can bind IPv6 and then request IPv4, reaching another service on the same port.
const http = require('node:http');

async function startTestServer(app, { port = 0 } = {}) {
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    const fail = (err) => {
      server.removeListener('listening', ready);
      reject(err);
    };
    const ready = () => {
      server.removeListener('error', fail);
      resolve();
    };
    server.once('error', fail);
    server.once('listening', ready);
    server.listen({ host: '127.0.0.1', port });
  });
  return server;
}

async function stopTestServer(server) {
  if (!server || !server.listening) return;
  await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

module.exports = { startTestServer, stopTestServer };

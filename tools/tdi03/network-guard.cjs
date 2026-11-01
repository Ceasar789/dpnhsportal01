// Preloaded into Node test workers and local Vite servers. No external sockets.
const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const { syncBuiltinESMExports } = require('node:module');
function check(host) {
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return;
  if (process.env.TDI03_NETWORK_LOG) fs.appendFileSync(process.env.TDI03_NETWORK_LOG, 'Blocked external network attempt\n');
  throw new Error('TDI03: external network prohibited');
}
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0] : args;
  const option = first[0];
  // Local IPC pipes are used by test workers/esbuild.
  if (typeof option === 'object' && option?.path || typeof option === 'string' && !/^\d+$/.test(option)) return connect.apply(this, args);
  check(typeof option === 'object' ? option.host || 'localhost' : typeof first[1] === 'string' ? first[1] : 'localhost');
  return connect.apply(this, args);
};
const secureConnect = tls.connect;
tls.connect = function (...args) {
  const option = args.find(a => a && typeof a === 'object') || {};
  check(option.host || (typeof args[1] === 'string' ? args[1] : 'localhost'));
  return secureConnect.apply(this, args);
};
const fetch = globalThis.fetch;
globalThis.fetch = function (input, ...args) {
  check(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname);
  return fetch(input, ...args);
};
syncBuiltinESMExports();

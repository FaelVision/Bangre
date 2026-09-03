/*
 * The `server-only` package throws when required outside a server bundle — it
 * exists to keep server modules out of the client build. Under `node --test`
 * there is no bundler to make that distinction, so requiring a lib that guards
 * itself with it (whatsapp.ts, payments-core.ts…) would fail. Stub it out.
 */
const Module = require("module");
const load = Module._load;

Module._load = function (request, ...rest) {
  if (request === "server-only") return {};
  return load.call(this, request, ...rest);
};

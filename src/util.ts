import * as process from "process";

let port: number = undefined;

export function isLocal(): boolean {
  // Could not just return process.env.TRANSCENDENCE_LOCAL, because it won't check for truthyValue, only boolean

  if (process.env.TRANSCENDENCE_LOCAL) {
    return true;
  }

  return false;
}

export function getBackendHost(): string {
  let envHost = process.env.IP_SERVER;

  return envHost;
}

export function getBackendPrefix(): string {
  if (process.env.TRANSCENDENCE_LOCAL) {
    return ":3000";
  } else {
    return "/api";
  }
}

export function getBackendPort(): number {
  if (isLocal()) {
    return 3000;
  } else {
    if (port === undefined) {
      port = Number.parseInt(process.env.PORT_BACK);
    }
    return port;
  }
}

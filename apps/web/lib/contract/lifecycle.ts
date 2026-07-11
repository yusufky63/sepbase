import { NAME_STATUS } from "./types";

export function lifecycleLabel(status: number) {
  if (status === NAME_STATUS.ACTIVE) return "ACTIVE";
  if (status === NAME_STATUS.GRACE) return "GRACE";
  if (status === NAME_STATUS.RELEASED) return "RELEASED";
  return "UNREGISTERED";
}

export function isResolvableStatus(status: number) {
  return status === NAME_STATUS.ACTIVE || status === NAME_STATUS.GRACE;
}

import { WsAdapter } from "../api/ws.js";

export const ws = new WsAdapter(
  `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`,
);

export function wsSend(data: unknown): void {
  ws.send(data);
}

import type { RuntimeEvent, ModelDto } from "../runtime/runtime-types.js";

export interface WsClient {
  send: (data: string) => void;
  close: () => void;
  readyState: number;
}

const WS_OPEN = 1;

export interface SubscriptionServiceCallbacks {
  onPrompt: (sessionHandle: string, text: string) => Promise<void>;
  onAbort: (sessionHandle: string) => Promise<void>;
  onListModels: (sessionHandle: string) => Promise<ModelDto[]>;
  onGetState: (sessionHandle: string) => Promise<import("../runtime/runtime-types.js").SessionStateDto>;
  onSetModel: (sessionHandle: string, provider: string, modelId: string) => Promise<void>;
  onSetThinkingLevel: (sessionHandle: string, level: string) => Promise<void>;
}

export class SubscriptionService {
  private clients = new Set<WsClient>();
  private callbacks: SubscriptionServiceCallbacks;

  constructor(callbacks: SubscriptionServiceCallbacks) {
    this.callbacks = callbacks;
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  addConnection(client: WsClient): void {
    this.clients.add(client);
  }

  removeConnection(client: WsClient): void {
    this.clients.delete(client);
  }

  broadcastEvent(event: RuntimeEvent): void {
    const data = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WS_OPEN) {
        client.send(data);
      }
    }
  }

  async handleClientMessage(raw: string, sender?: WsClient): Promise<void> {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed.type === "session.prompt" && parsed.sessionHandle && parsed.text) {
      await this.callbacks.onPrompt(parsed.sessionHandle, parsed.text);
    } else if (parsed.type === "session.abort" && parsed.sessionHandle) {
      await this.callbacks.onAbort(parsed.sessionHandle);
    } else if (parsed.type === "session.list_models" && parsed.sessionHandle) {
      const models = await this.callbacks.onListModels(parsed.sessionHandle);
      if (sender && sender.readyState === WS_OPEN) {
        sender.send(JSON.stringify({
          type: "session.models",
          sessionHandle: parsed.sessionHandle,
          models,
        }));
      }
    } else if (parsed.type === "session.get_state" && parsed.sessionHandle) {
      const state = await this.callbacks.onGetState(parsed.sessionHandle);
      if (sender && sender.readyState === WS_OPEN) {
        sender.send(JSON.stringify({
          type: "session.state",
          sessionHandle: parsed.sessionHandle,
          state,
        }));
      }
    } else if (parsed.type === "session.set_model" && parsed.sessionHandle && parsed.provider && parsed.modelId) {
      await this.callbacks.onSetModel(parsed.sessionHandle, parsed.provider, parsed.modelId);
    } else if (parsed.type === "session.set_thinking_level" && parsed.sessionHandle && parsed.level) {
      await this.callbacks.onSetThinkingLevel(parsed.sessionHandle, parsed.level);
    }
  }
}

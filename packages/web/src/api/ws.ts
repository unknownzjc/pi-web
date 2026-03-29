type WsEventHandler = (event: unknown) => void;

interface WsLifecycle {
  onOpen?: () => void;
  onClose?: () => void;
  onReconnect?: () => void;
}

export class WsAdapter {
  private ws: WebSocket | null = null;
  private handler: WsEventHandler | null = null;
  private lifecycle: WsLifecycle | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;
  private wasConnected: boolean = false;
  private connectAttempts: number = 0;
  private maxConnectAttempts: number;

  constructor(url: string, maxConnectAttempts = 3) {
    this.url = url;
    this.maxConnectAttempts = maxConnectAttempts;
  }

  connect(handler: WsEventHandler, lifecycle?: WsLifecycle): void {
    this.handler = handler;
    this.lifecycle = lifecycle ?? null;
    this.connectAttempts = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.handler = null;
    this.lifecycle = null;
    this.clearReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  private doConnect(): void {
    this.connectAttempts++;
    const ws = new WebSocket(this.url);

    ws.onopen = () => {
      const isReconnect = this.wasConnected;
      this.ws = ws;
      this.wasConnected = true;
      this.connectAttempts = 0;
      this.lifecycle?.onOpen?.();
      if (isReconnect) {
        this.lifecycle?.onReconnect?.();
      }
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string);
        this.handler?.(parsed);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.lifecycle?.onClose?.();
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private scheduleReconnect(): void {
    if (!this.handler) return;
    // Stop retrying if the server doesn't support WebSocket
    if (!this.wasConnected && this.connectAttempts >= this.maxConnectAttempts) {
      return;
    }
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

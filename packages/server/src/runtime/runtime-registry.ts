import type { AgentRuntime } from "./agent-runtime.js";

export class RuntimeRegistry {
  private runtimes = new Map<string, AgentRuntime>();

  register(runtime: AgentRuntime): void {
    this.runtimes.set(runtime.runtimeId, runtime);
  }

  get(runtimeId: string): AgentRuntime | undefined {
    return this.runtimes.get(runtimeId);
  }

  get default(): AgentRuntime {
    const first = this.runtimes.values().next().value;
    if (!first) throw new Error("No runtime registered");
    return first;
  }
}

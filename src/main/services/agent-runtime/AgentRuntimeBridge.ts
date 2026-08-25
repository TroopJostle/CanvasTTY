import type { ProviderId } from "../../../shared/contracts.ts";
import { AGENT_RUNTIME_ENV } from "../../../agent-runtime/runtime-protocol.mjs";
import type { RuntimeGateway, RuntimeLifecycleState } from "./RuntimeGateway.ts";
import {
  ProviderRuntimeLaunchAdapters,
  type ProviderRuntimeLaunchOptions
} from "./ProviderRuntimeLaunch.ts";

export interface PrepareAgentRuntimeLaunchInput {
  terminalSessionId: string;
  provider: Exclude<ProviderId, "terminal">;
  cwd: string;
}

export interface PreparedAgentRuntimePtyLaunch {
  args: string[];
  environment: Record<string, string>;
  cleanup(): void;
}

export interface AgentRuntimeLaunchCoordinator {
  prepareLaunch(input: PrepareAgentRuntimeLaunchInput): PreparedAgentRuntimePtyLaunch;
  currentStatus(terminalSessionId: string): RuntimeLifecycleState | null;
}

export interface AgentRuntimeBridgeOptions extends ProviderRuntimeLaunchOptions {
  recoverOnStart?: boolean;
}

export class AgentRuntimeBridge implements AgentRuntimeLaunchCoordinator {
  private readonly gateway: RuntimeGateway;
  private readonly providers: ProviderRuntimeLaunchAdapters;

  constructor(gateway: RuntimeGateway, options: AgentRuntimeBridgeOptions) {
    this.gateway = gateway;
    this.providers = new ProviderRuntimeLaunchAdapters(options);
    if (options.recoverOnStart) this.providers.recoverConfigurations();
  }

  prepareLaunch(input: PrepareAgentRuntimeLaunchInput): PreparedAgentRuntimePtyLaunch {
    const capability = this.gateway.registerSession(input.terminalSessionId, input.provider);
    let prepared;
    try {
      prepared = this.providers.prepare(input.provider, input.terminalSessionId);
    } catch (error) {
      this.gateway.revokeTerminalSession(input.terminalSessionId);
      throw error;
    }
    let cleaned = false;
    return {
      args: prepared.args,
      environment: {
        ...prepared.environment,
        [AGENT_RUNTIME_ENV.address]: capability.address,
        [AGENT_RUNTIME_ENV.terminalSessionId]: capability.terminalSessionId,
        [AGENT_RUNTIME_ENV.provider]: capability.provider,
        [AGENT_RUNTIME_ENV.capabilityToken]: capability.capabilityToken
      },
      cleanup: () => {
        if (cleaned) return;
        cleaned = true;
        try {
          prepared.releaseConfiguration();
        } finally {
          this.gateway.revokeTerminalSession(input.terminalSessionId);
        }
      }
    };
  }

  currentStatus(terminalSessionId: string): RuntimeLifecycleState | null {
    return this.gateway.currentStatus(terminalSessionId);
  }
}

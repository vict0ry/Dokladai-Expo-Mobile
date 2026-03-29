export type BridgeAction =
  | "DOCUMENT_SCANNED"
  | "BIOMETRIC_STATUS"
  | "NOTIFICATION_TOKEN"
  | "APP_READY";

export interface BridgeMessage {
  action: BridgeAction;
  payload: Record<string, unknown>;
  timestamp: number;
}

export function createBridgeMessage(
  action: BridgeAction,
  payload: Record<string, unknown>
): BridgeMessage {
  return {
    action,
    payload,
    timestamp: Date.now(),
  };
}

export function buildInjectionScript(message: BridgeMessage): string {
  const json = JSON.stringify(message);
  return `
    (function() {
      try {
        window.postMessage(${JSON.stringify(json)}, '*');
        if (window.DokladBridge && typeof window.DokladBridge.onMessage === 'function') {
          window.DokladBridge.onMessage(${JSON.stringify(json)});
        }
      } catch(e) {}
      true;
    })();
  `;
}

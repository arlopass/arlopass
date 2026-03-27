export type SetupStep = 1 | 2 | 3 | 4 | 5;

export type OnboardingSetupState = {
  completed: boolean;
  bridgeInstalled: boolean;
  currentStep: SetupStep;
};

const STORAGE_KEY = "byom.onboarding.setup";

const DEFAULT_STATE: OnboardingSetupState = {
  completed: false,
  bridgeInstalled: false,
  currentStep: 1,
};

export async function readSetupState(): Promise<OnboardingSetupState> {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const raw = result[STORAGE_KEY];
      if (
        raw != null &&
        typeof raw === "object" &&
        typeof (raw as Record<string, unknown>).completed === "boolean" &&
        typeof (raw as Record<string, unknown>).currentStep === "number"
      ) {
        resolve(raw as OnboardingSetupState);
      } else {
        resolve(DEFAULT_STATE);
      }
    });
  });
}

export async function writeSetupState(state: OnboardingSetupState): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: state }, resolve);
  });
}

export async function markSetupComplete(): Promise<void> {
  const current = await readSetupState();
  await writeSetupState({ ...current, completed: true, currentStep: 5 });
}

export async function detectBridge(): Promise<{ connected: boolean; version?: string }> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ connected: false });
    }, 5000);

    try {
      chrome.runtime.sendNativeMessage(
        "com.byom.bridge",
        { type: "ping" },
        (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            resolve({ connected: false });
            return;
          }
          const version = typeof response?.version === "string" ? response.version : undefined;
          resolve({ connected: true, version });
        },
      );
    } catch {
      clearTimeout(timeout);
      resolve({ connected: false });
    }
  });
}

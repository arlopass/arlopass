export type OnboardingStep =
  | "select-provider"
  | "choose-credential"
  | "enter-credentials"
  | "test-connection"
  | "connection-result";

export type OnboardingState = {
  step: OnboardingStep;
  selectedConnectorId: string | null;
  selectedCredentialId: string | null;
  credentialName: string;
  fieldValues: Record<string, string>;
  providerName: string;
  testing: boolean;
  testResult: {
    ok: boolean;
    message: string;
    modelCount: number;
  } | null;
  saving: boolean;
};

export const INITIAL_STATE: OnboardingState = {
  step: "select-provider",
  selectedConnectorId: null,
  selectedCredentialId: null,
  credentialName: "",
  fieldValues: {},
  providerName: "",
  testing: false,
  testResult: null,
  saving: false,
};

export type OnboardingAction =
  | { type: "SELECT_PROVIDER"; connectorId: string; credentialName: string; fieldValues: Record<string, string>; providerName: string }
  | { type: "GO_TO_CHOOSE_CREDENTIAL" }
  | { type: "SELECT_CREDENTIAL"; credentialId: string; credentialName: string; fieldValues: Record<string, string> }
  | { type: "CLEAR_CREDENTIAL_SELECTION" }
  | { type: "GO_TO_CREATE_CREDENTIAL" }
  | { type: "GO_TO_CREDENTIALS" }
  | { type: "SET_FIELD"; key: string; value: string }
  | { type: "SET_CREDENTIAL_NAME"; name: string }
  | { type: "SET_PROVIDER_NAME"; name: string }
  | { type: "GO_TO_TEST" }
  | { type: "START_TEST" }
  | { type: "TEST_SUCCESS"; message: string; modelCount: number }
  | { type: "TEST_FAILURE"; message: string }
  | { type: "START_SAVE" }
  | { type: "SAVE_COMPLETE" }
  | { type: "GO_BACK" }
  | { type: "RESET" }
  | { type: "__HYDRATE__"; state: OnboardingState };

export function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case "SELECT_PROVIDER":
      return {
        ...state,
        selectedConnectorId: action.connectorId,
        selectedCredentialId: null,
        credentialName: action.credentialName,
        fieldValues: action.fieldValues,
        providerName: action.providerName,
      };

    case "GO_TO_CHOOSE_CREDENTIAL":
      return { ...state, step: "choose-credential", selectedCredentialId: null };

    case "SELECT_CREDENTIAL":
      return {
        ...state,
        selectedCredentialId: action.credentialId,
        credentialName: action.credentialName,
        fieldValues: action.fieldValues,
      };

    case "CLEAR_CREDENTIAL_SELECTION":
      return { ...state, selectedCredentialId: null };

    case "GO_TO_CREATE_CREDENTIAL":
      return { ...state, step: "enter-credentials", selectedCredentialId: null };

    case "GO_TO_CREDENTIALS":
      return { ...state, step: "enter-credentials" };

    case "SET_FIELD":
      return { ...state, fieldValues: { ...state.fieldValues, [action.key]: action.value } };

    case "SET_CREDENTIAL_NAME":
      return { ...state, credentialName: action.name };

    case "SET_PROVIDER_NAME":
      return { ...state, providerName: action.name };

    case "GO_TO_TEST":
      return { ...state, step: "test-connection", testResult: null };

    case "START_TEST":
      return { ...state, testing: true, testResult: null };

    case "TEST_SUCCESS":
      return {
        ...state,
        testing: false,
        testResult: { ok: true, message: action.message, modelCount: action.modelCount },
        step: "connection-result",
      };

    case "TEST_FAILURE":
      return {
        ...state,
        testing: false,
        testResult: { ok: false, message: action.message, modelCount: 0 },
      };

    case "START_SAVE":
      return { ...state, saving: true };

    case "SAVE_COMPLETE":
      return { ...state, saving: false };

    case "GO_BACK": {
      if (state.step === "connection-result") return { ...state, step: "test-connection", testResult: null };
      if (state.step === "test-connection") return { ...state, step: "choose-credential" };
      if (state.step === "enter-credentials") return { ...state, step: "choose-credential" };
      if (state.step === "choose-credential") return { ...state, step: "select-provider" };
      return state;
    }

    case "RESET":
      return INITIAL_STATE;

    case "__HYDRATE__":
      return { ...INITIAL_STATE, ...action.state, testing: false, saving: false };

    default:
      return state;
  }
}

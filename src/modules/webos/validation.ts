import { MODEL_INPUTS } from "./models.ts";
import type { KnownInput } from "./types.ts";

export function validateInput(modelName: string, input: string): void {
  const valid = MODEL_INPUTS[modelName];
  if (!valid) {
    console.warn(
      `[monitor-kvm] Unknown model "${modelName}". Skipping input validation.`
    );
    return;
  }
  if (!valid.includes(input)) {
    throw new Error(
      `Invalid input "${input}" for model "${modelName}". Valid inputs: ${valid.join(", ")}`
    );
  }
}

export function isKnownInput(input: string): input is KnownInput {
  const known: readonly string[] = [
    "HDMI_1",
    "HDMI_2",
    "HDMI_3",
    "HDMI_4",
    "COMPOSITE",
    "COMPONENT",
    "LIVE_TV",
    "RGB",
    "MIRACAST",
    "IMGVIEWER",
    "USB",
    "DVR",
    "MEDIA",
  ];
  return known.includes(input);
}

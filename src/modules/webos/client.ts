import { ConnectionManager } from "./connection.ts";
import { validateInput } from "./validation.ts";
import type { SystemInfo, WebOSClient } from "./types.ts";

const APP_ID_TO_INPUT: Record<string, string> = {
  "com.webos.app.hdmi1": "HDMI_1",
  "com.webos.app.hdmi2": "HDMI_2",
  "com.webos.app.hdmi3": "HDMI_3",
  "com.webos.app.hdmi4": "HDMI_4",
  "com.webos.app.dp1": "DISPLAYPORT_1",
  "com.webos.app.dp2": "DISPLAYPORT_2",
  "com.webos.app.usbc1": "USB_C",
  "com.webos.app.livetv": "LIVE_TV",
  "com.webos.app.externalinput.component": "COMPONENT",
  "com.webos.app.externalinput.av1": "COMPOSITE",
  "com.webos.app.screenshare": "SCREEN_SHARE",
};

const INPUT_TO_APP_ID: Record<string, string> = {
  HDMI_1: "com.webos.app.hdmi1",
  HDMI_2: "com.webos.app.hdmi2",
  HDMI_3: "com.webos.app.hdmi3",
  HDMI_4: "com.webos.app.hdmi4",
  DISPLAYPORT_1: "com.webos.app.dp1",
  DISPLAYPORT_2: "com.webos.app.dp2",
  USB_C: "com.webos.app.usbc1",
  LIVE_TV: "com.webos.app.livetv",
  COMPOSITE: "com.webos.app.externalinput.av1",
  COMPONENT: "com.webos.app.externalinput.component",
  SCREEN_SHARE: "com.webos.app.screenshare",
};

export function createClient(
  host: string,
  clientKey: string
): WebOSClient {
  const conn = new ConnectionManager(host, clientKey);
  let cachedModelName: string | undefined;

  const client: WebOSClient = {
    get connected() {
      return conn.connected;
    },

    async call(uri, payload) {
      return conn.send(uri, payload);
    },

    async setInput(input) {
      if (!cachedModelName) {
        try {
          const info = await client.getSystemInfo();
          cachedModelName = info.modelName;
        } catch {
          // ignore; skip validation if we can't reach the TV
        }
      }
      if (cachedModelName) {
        validateInput(cachedModelName, input);
      }

      const appId = INPUT_TO_APP_ID[input];
      if (appId) {
        try {
          await conn.send("ssap://system.launcher/launch", { id: appId });
          return;
        } catch {
          // fall through to tv/switchInput
        }
      }
      await conn.send("ssap://tv/switchInput", { inputId: input });
    },

    async getInput() {
      const result = (await conn.send(
        "ssap://com.webos.applicationManager/getForegroundAppInfo"
      )) as {
        returnValue?: boolean;
        appId?: string;
      };
      const appId = result.appId;
      if (appId && APP_ID_TO_INPUT[appId]) {
        return APP_ID_TO_INPUT[appId]!;
      }
      return appId ?? "unknown";
    },

    async setBrightness(value) {
      try {
        await conn.send("ssap://config/setConfigs", {
          configs: { "com.palm.brightness": value },
        });
      } catch (err: any) {
        if (err.message?.includes("401")) {
          throw new Error(
            "Brightness control not available on this monitor model. " +
            "Use button emulation (sendKey) to navigate the OSD instead."
          );
        }
        throw err;
      }
    },

    async getBrightness() {
      try {
        const result = (await conn.send("ssap://config/getConfigs", {
          configNames: ["com.palm.brightness"],
        })) as {
          returnValue?: boolean;
          configs?: Record<string, number>;
        };
        const brightness = result.configs?.["com.palm.brightness"];
        if (brightness !== undefined) return brightness;
      } catch (err: any) {
        if (err.message?.includes("401")) {
          throw new Error(
            "Brightness control not available on this monitor model."
          );
        }
        throw err;
      }
      throw new Error("Failed to get brightness");
    },

    async setVolume(value) {
      await conn.send("ssap://audio/setVolume", { volume: value });
    },

    async getVolume() {
      const result = (await conn.send("ssap://audio/getVolume")) as {
        returnValue?: boolean;
        volume?: number;
        volumeStatus?: { volume?: number };
      };
      const vol = result.volume ?? result.volumeStatus?.volume;
      if (vol === undefined) {
        throw new Error("Failed to get volume");
      }
      return vol;
    },

    async mute() {
      await conn.send("ssap://audio/setMute", { mute: true });
    },

    async unmute() {
      await conn.send("ssap://audio/setMute", { mute: false });
    },

    async powerOff() {
      await conn.send("ssap://system/turnOff");
    },

    async turnOffScreen() {
      await conn.send(
        "ssap://com.webos.service.tvpower/power/turnOffScreen"
      );
    },

    async turnOnScreen() {
      await conn.send(
        "ssap://com.webos.service.tvpower/power/turnOnScreen"
      );
    },

    async getSystemInfo() {
      const result = (await conn.send("ssap://system/getSystemInfo")) as {
        returnValue?: boolean;
        modelName?: string;
        sdkVersion?: string;
        firmwareVersion?: string;
        uhd?: boolean;
        features?: Record<string, unknown>;
      };
      if (!result.returnValue) {
        throw new Error("Failed to get system info");
      }
      return {
        modelName: result.modelName ?? "unknown",
        sdkVersion: result.sdkVersion ?? "unknown",
        firmwareVersion: result.firmwareVersion ?? "unknown",
        uhd: result.uhd,
        features: result.features,
      };
    },

    async getServiceList() {
      const result = (await conn.send("ssap://api/getServiceList")) as {
        returnValue?: boolean;
        services?: { name: string }[];
      };
      if (!result.returnValue || !result.services) {
        return [];
      }
      return result.services.map((s) => s.name);
    },

    async launchApp(appId, params) {
      await conn.send("ssap://system.launcher/launch", {
        id: appId,
        ...(params ?? {}),
      });
    },

    async disconnect() {
      await conn.disconnect();
    },
  };

  return client;
}

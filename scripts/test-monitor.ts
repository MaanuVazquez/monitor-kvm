#!/usr/bin/env bun
import { pair, connect } from "../src/modules/webos/index.ts";
import { createInterface } from "node:readline";

const host = process.argv[2];
const usePin = process.argv.includes("--pin");

async function main() {
  if (!host) {
    console.error("Usage: bun run scripts/test-monitor.ts <host> [--pin]");
    console.error(
      "  --pin  Use PIN pairing (higher trust, enables brightness)",
    );
    console.error(
      "Example: bun run scripts/test-monitor.ts 192.168.1.17 --pin",
    );
    throw new Error("Missing host argument");
  }

  console.log(`\n🖥️  Target monitor: ${host}\n`);

  // Try to connect first. If no credentials, pair first.
  let client;
  try {
    console.log("Connecting...");
    client = await connect({ host });
    console.log("✅ Connected using stored credentials\n");
  } catch (err: any) {
    if (err.message.includes("No credentials found")) {
      if (usePin) {
        console.log("No credentials found. Starting PIN pairing flow...");
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        await pair({
          host,
          pairingType: "PIN",
          pin: () =>
            new Promise((resolve) => {
              console.log("👉 Check the monitor screen for the pairing code.");
              rl.question(
                "Enter the PIN code shown on the monitor: ",
                (code) => {
                  resolve(code.trim());
                  rl.close();
                },
              );
            }),
        });
      } else {
        console.log("No credentials found. Starting pairing flow...");
        console.log('👉 Click "Allow" on the TV when prompted.\n');
        await pair({ host });
      }
      console.log("✅ Paired successfully. Connecting...\n");
      client = await connect({ host });
    } else {
      throw err;
    }
  }

  // System info
  console.log("--- System Info ---");
  const info = await client.getSystemInfo();
  console.log(`Model:        ${info.modelName}`);
  console.log(`SDK:          ${info.sdkVersion}`);
  console.log(`Firmware:     ${info.firmwareVersion}`);
  console.log(`UHD:          ${info.uhd ?? "unknown"}`);
  console.log();

  // Input
  console.log("--- Input ---");
  const currentInput = await client.getInput();
  await client.setInput("USB-C_1");
  console.log(`Current input: ${currentInput}`);
  // Uncomment to test switching:
  // await client.setInput("HDMI_2");
  // console.log("Switched to HDMI_2");
  console.log();

  // Volume
  console.log("--- Volume ---");
  const vol = await client.getVolume();
  console.log(`Current volume: ${vol}`);
  // Uncomment to test muting:
  // await client.mute();
  // console.log("Muted");
  // await client.unmute();
  // console.log("Unmuted");
  console.log();

  // Brightness
  console.log("--- Brightness ---");
  try {
    const brightness = await client.getBrightness();
    console.log(`Current brightness: ${brightness}`);
  } catch (err: any) {
    console.log(`⚠️  Brightness API not available on this monitor model.`);
    console.log(`   Reason: ${err.message}`);
  }
  console.log();

  // Available inputs
  console.log("--- Available Inputs ---");
  const inputList = (await client.call(
    "ssap://tv/getExternalInputList",
  )) as any;
  if (inputList.devices) {
    for (const d of inputList.devices) {
      const connected = d.connected ? "✅" : "❌";
      console.log(`  ${connected} ${d.label} (${d.id}) - appId: ${d.appId}`);
    }
  }
  console.log();

  // Generic call example
  console.log("--- Generic call example ---");
  const result = await client.call("ssap://audio/getStatus");
  console.log("audio/getStatus response:", result);
  console.log();

  await client.disconnect();
  console.log("✅ Disconnected\n");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});

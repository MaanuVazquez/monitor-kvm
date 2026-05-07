import { connect } from "./modules/webos/index.ts";

const HOST = process.argv[2] || "192.168.1.17";

const READ_ENDPOINTS: { name: string; uri: string; payload?: Record<string, unknown> }[] = [
  // --- Brightness / Picture ---
  { name: "config/getConfigs", uri: "ssap://config/getConfigs" },
  { name: "config/getConfigs (brightness)", uri: "ssap://config/getConfigs", payload: { configNames: ["com.palm.brightness"] } },
  { name: "settings/getSystemSettings", uri: "ssap://settings/getSystemSettings" },
  { name: "settings/getSystemSettings (picture)", uri: "ssap://settings/getSystemSettings", payload: { category: "picture", keys: ["brightness"] } },
  { name: "settings/getSystemSettings (sound)", uri: "ssap://settings/getSystemSettings", payload: { category: "sound", keys: ["soundMode"] } },
  { name: "externalpq/getExternalPqSettings", uri: "ssap://externalpq/getExternalPqSettings" },
  { name: "externalpq/getExternalPqData", uri: "ssap://externalpq/getExternalPqData" },

  // --- Input ---
  { name: "tv/getExternalInputList", uri: "ssap://tv/getExternalInputList" },

  // --- Audio ---
  { name: "audio/getVolume", uri: "ssap://audio/getVolume" },
  { name: "audio/getMute", uri: "ssap://audio/getMute" },

  // --- System ---
  { name: "system/getSystemInfo", uri: "ssap://system/getSystemInfo" },
  { name: "getServiceList", uri: "ssap://api/getServiceList" },
];

async function main() {
  console.log(`Scanning APIs on ${HOST}...\n`);

  const client = await connect({ host: HOST });

  for (const ep of READ_ENDPOINTS) {
    try {
      const result = await client.call(ep.uri, ep.payload);
      let summary: string;
      if (ep.name === "getServiceList") {
        const services = (result as any)?.services;
        if (Array.isArray(services)) {
          const names = services.map((s: any) => s.name).join(", ");
          console.log(`  ✅ getServiceList → services: ${names}\n`);
          continue;
        }
        summary = JSON.stringify(result, null, 2);
      } else {
        summary = typeof result === "object" ? JSON.stringify(result).slice(0, 300) : String(result);
      }
      console.log(`  ✅ ${ep.name}`);
      console.log(`     ${summary}\n`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.log(`  ❌ ${ep.name} → ${msg.slice(0, 100)}\n`);
    }
  }

  console.log("Done.");
  await client.disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});

import type { DeviceListItem } from "../types.ts";

interface AppProps {
  devices: DeviceListItem[];
}

const App = ({ devices }: AppProps) => {
  return (
    <html>
      <body>
        <h1>monitor-kvm</h1>
        <p>WebOS Smart Monitor Control</p>

        {devices.length === 0 ? (
          <p>No devices paired. Use the CLI or POST /api/devices/:host/pair to pair a device.</p>
        ) : (
          <div>
            <h2>Paired Devices</h2>
            <ul>
              {devices.map((d) => (
                <li key={d.host}>
                  <strong>{d.host}</strong>
                  {" — "}
                  <span style={{ color: d.connected ? "green" : "red" }}>
                    {d.connected ? "connected" : "disconnected"}
                  </span>
                  {d.pairedAt && <span> — paired {new Date(d.pairedAt).toLocaleString()}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </body>
    </html>
  );
};

export default App;

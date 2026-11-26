// === filename: frontend/src/sampleLogs.js ===
const DOMAIN_SAMPLE = [
  'google.com', 'connectivitycheck.gstatic.com', 'github.com', 'api.weather.gov', 'freeapp.tk',
  'fonts.googleapis.com', 'netflix.com', 'malware-c2.xyz', 'time.apple.com', 'cloudflare.com',
  'dropbox.com', 'wikipedia.org', 'proton.me', 'spotify.com', 'ubuntu.com', 'signal.org',
  'amazon.com', 'mozilla.org', 'ntp.org', 'zoom.us', 'openai.com', 'reddit.com', 'iana.org',
  'accounts.google.com', 'support.apple.com', 'example.ru', 'cdn.content-delivery.top',
];

/** Build a fresh, deterministic-story D-Link sample with more than 80 RFC3164 lines. */
export function buildSampleLogs() {
  const events = [];
  const now = new Date();
  const add = (minutesAgo, seconds, pri, process, message) => {
    const date = new Date(now.getTime() - minutesAgo * 60000 - seconds * 1000);
    const month = date.toLocaleString('en-US', { month: 'short' });
    const stamp = `${month} ${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
    events.push({ time: date.getTime(), line: `<${pri}>${stamp} DSL-8251CG1 ${process}: ${message}` });
  };

  add(58, 0, 30, 'resident[1]', 'router startup complete; firmware 1.00.04; LAN 192.168.0.1');
  add(57, 12, 134, 'pppd[1204]', 'pppd 2.4.7 started by root, uid 0');
  add(57, 8, 134, 'pppd[1204]', 'Connect: ppp0 <--> nas0');
  add(56, 48, 134, 'pppd[1204]', 'local IP address 198.51.100.24');
  add(56, 42, 134, 'pppd[1204]', 'remote IP address 198.51.100.1');

  const clients = [
    { ip: '192.168.0.24', mac: '7C:8B:CA:12:34:56', name: 'Pixel-7' },
    { ip: '192.168.0.31', mac: '48:2F:6B:91:20:A1', name: 'office-laptop' },
    { ip: '192.168.0.42', mac: 'A0:36:BC:9D:55:02', name: 'media-center' },
  ];
  clients.forEach((client, index) => {
    const at = 51 - index * 8;
    add(at, 30, 134, 'kernel[0]', `wlan0: authenticate with ${client.mac}`);
    add(at, 26, 134, 'kernel[0]', `wlan0: associated with ${client.mac}`);
    add(at, 23, 134, 'dnsmasq-dhcp[1184]', `DHCPDISCOVER(br0) ${client.mac}`);
    add(at, 20, 134, 'dnsmasq-dhcp[1184]', `DHCPOFFER(br0) ${client.ip} ${client.mac}`);
    add(at, 17, 134, 'dnsmasq-dhcp[1184]', `DHCPREQUEST(br0) ${client.ip} ${client.mac}`);
    add(at, 14, 134, 'dnsmasq-dhcp[1184]', `DHCPACK(br0) ${client.ip} ${client.mac} ${client.name} lease time 86400`);
  });

  DOMAIN_SAMPLE.forEach((domain, index) => {
    const client = clients[index % clients.length];
    const age = 46 - (index % 35);
    add(age, 38 + (index % 12), 134, 'dnsmasq[1184]', `query[${index % 3 === 0 ? 'AAAA' : 'A'}] ${domain} from ${client.ip}`);
    if (index % 2 === 0) add(age, 32 + (index % 11), isSuspicious(domain) ? 132 : 134, 'dnsmasq[1184]', `reply ${domain} is ${index % 2 ? '203.0.113.53' : '142.250.72.14'}`);
  });

  add(22, 40, 132, 'kernel[0]', 'wlan0: disassociated from 7C:8B:CA:12:34:56 (Reason: 3=DEAUTH_LEAVING)');
  add(18, 25, 132, 'pppd[1204]', 'LCP terminated by peer');
  add(18, 20, 132, 'pppd[1204]', 'Connection terminated; Connect time 38 minutes');
  add(18, 10, 134, 'pppd[1392]', 'pppd 2.4.7 started by root, uid 0');
  add(18, 4, 134, 'pppd[1392]', 'Connect: ppp0 <--> nas0');
  add(17, 48, 134, 'pppd[1392]', 'local IP address 198.51.100.24');
  add(17, 44, 134, 'pppd[1392]', 'remote IP address 198.51.100.1');

  [21, 22, 23, 25, 53, 80, 110, 443, 445, 1433, 3389, 5900, 8080, 8443].forEach((port, index) => {
    add(12, 48 - index * 3, index === 0 ? 131 : 132, 'firewall[0]', `DROP IN=ppp0 SRC=203.0.113.77 DST=198.51.100.24 PROTO=TCP SPT=${41000 + index} DPT=${port}`);
  });
  add(11, 8, 132, 'firewall[0]', 'REJECT IN=ppp0 SRC=198.51.100.201 DST=198.51.100.24 PROTO=UDP SPT=53210 DPT=1900');
  add(7, 18, 134, 'resident[1]', 'dhcp_opt_rule applied: LAN lease policy updated');
  add(7, 12, 134, 'save_to_flash[704]', 'configuration saved to flash by admin');
  add(2, 20, 134, 'dnsmasq-dhcp[1184]', 'DHCPREQUEST(br0) 192.168.0.24 7C:8B:CA:12:34:56');
  add(2, 16, 134, 'dnsmasq-dhcp[1184]', 'DHCPACK(br0) 192.168.0.24 7C:8B:CA:12:34:56 Pixel-7 lease time 86400');
  add(0, 10, 134, 'kernel[0]', 'wlan0: associated with 7C:8B:CA:12:34:56');

  return events.sort((a, b) => a.time - b.time).map((event) => event.line);
}

function isSuspicious(domain) {
  return /\.(tk|xyz|ru|cn|top|zip|click|gq)$/i.test(domain);
}

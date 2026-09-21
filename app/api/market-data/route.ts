import { env } from "cloudflare:workers";

const ASSETS = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  litecoin: "LTC",
  tether: "USDT",
  binancecoin: "BNB",
  ripple: "XRP",
  dogecoin: "DOGE",
  cardano: "ADA",
  "avalanche-2": "AVAX",
  polkadot: "DOT",
  chainlink: "LINK",
  tron: "TRX",
} as const;

type AssetId = keyof typeof ASSETS;
type MoneyCurrency = "CNY" | "USD" | "USDT" | "JPY" | "HKD" | "EUR" | "GBP" | "CAD";
type NormalizedQuote = { usdt: number; change24h: number; lastUpdatedAt: number };
type FinalQuote = NormalizedQuote & { usd: number; cny: number };
type CachePayload = {
  key: string;
  rates: Record<MoneyCurrency, number>;
  quotes: Record<string, FinalQuote>;
  fetchedAt: string;
  sources: { crypto: string; fx: string };
  stale?: boolean;
  estimatedFx?: boolean;
  missing?: string[];
};
type CacheValue = { expires: number; payload: CachePayload };
type BinanceTicker = { symbol?: string; lastPrice?: string; priceChangePercent?: string; closeTime?: number };
type CryptoCompareRow = { PRICE?: number; CHANGEPCT24HOUR?: number; LASTUPDATE?: number };
type CoinGeckoRow = Record<string, number | null>;

let cache: CacheValue | null = null;
let lastGood: CachePayload | null = null;
const MONEY_CURRENCIES: MoneyCurrency[] = ["CNY", "USD", "USDT", "JPY", "HKD", "EUR", "GBP", "CAD"];
const SAFE_RATES: Record<MoneyCurrency, number> = { CNY: 1, USD: 7.2, USDT: 7.2, JPY: 0.049, HKD: 0.92, EUR: 8.4, GBP: 9.7, CAD: 5.2 };

async function readPersistentCache(key: string) {
  try {
    const row = await env.DB.prepare("SELECT payload_json FROM ledger_market_cache WHERE cache_key = ?").bind(key).first<{ payload_json: string }>();
    if (!row?.payload_json) return null;
    const payload = JSON.parse(row.payload_json) as CachePayload;
    return payload.key === key ? payload : null;
  } catch { return null; }
}

async function persistCache(payload: CachePayload) {
  try {
    await env.DB.prepare("INSERT INTO ledger_market_cache (cache_key, payload_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(cache_key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP").bind(payload.key, JSON.stringify(payload)).run();
  } catch { /* live quotes still remain usable when durable cache is unavailable */ }
}

function cleanIds(raw: string | null) {
  return Array.from(new Set((raw || "").split(",").filter((id): id is AssetId => id in ASSETS))).sort();
}

async function checkedFetch(url: string, label: string, accept = "application/json") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_500);
  try {
    const response = await fetch(url, { headers: { accept }, signal: controller.signal });
    if (!response.ok) throw new Error(`${label} ${response.status}`);
    return response;
  } finally { clearTimeout(timer); }
}

async function fromBinance(ids: AssetId[]) {
  const wanted = ids.filter((id) => id !== "tether");
  if (!wanted.length) return {} as Record<string, NormalizedQuote>;
  const symbols = wanted.map((id) => `${ASSETS[id]}USDT`);
  const query = new URLSearchParams({ symbols: JSON.stringify(symbols), type: "FULL", symbolStatus: "TRADING" });
  const endpoints = ["https://data-api.binance.vision", "https://api-gcp.binance.com"];
  const rows = await Promise.any(endpoints.map(async (endpoint) => {
      const response = await checkedFetch(`${endpoint}/api/v3/ticker/24hr?${query}`, "Binance");
      const data = await response.json() as BinanceTicker[] | BinanceTicker;
      return Array.isArray(data) ? data : [data];
  }));
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));
  return Object.fromEntries(wanted.flatMap((id) => {
    const row = bySymbol.get(`${ASSETS[id]}USDT`);
    const usdt = Number(row?.lastPrice || 0);
    return usdt > 0 ? [[id, { usdt, change24h: Number(row?.priceChangePercent || 0), lastUpdatedAt: Math.floor(Number(row?.closeTime || Date.now()) / 1000) }]] : [];
  })) as Record<string, NormalizedQuote>;
}

async function fromCryptoCompare(ids: AssetId[]) {
  if (!ids.length) return {} as Record<string, NormalizedQuote>;
  const symbols = ids.map((id) => ASSETS[id]);
  const query = new URLSearchParams({ fsyms: symbols.join(","), tsyms: "USD", extraParams: "FlowLedger" });
  const response = await checkedFetch(`https://min-api.cryptocompare.com/data/pricemultifull?${query}`, "CryptoCompare");
  const data = await response.json() as { RAW?: Record<string, { USD?: CryptoCompareRow }>; Response?: string };
  if (data.Response === "Error") throw new Error("CryptoCompare 暂不可用");
  return Object.fromEntries(ids.flatMap((id) => {
    const row = data.RAW?.[ASSETS[id]]?.USD;
    const usdt = Number(row?.PRICE || 0);
    return usdt > 0 ? [[id, { usdt, change24h: Number(row?.CHANGEPCT24HOUR || 0), lastUpdatedAt: Number(row?.LASTUPDATE || Math.floor(Date.now() / 1000)) }]] : [];
  })) as Record<string, NormalizedQuote>;
}

async function fromCoinGecko(ids: AssetId[]) {
  if (!ids.length) return {} as Record<string, NormalizedQuote>;
  const query = new URLSearchParams({ ids: ids.join(","), vs_currencies: "usd", include_24hr_change: "true", include_last_updated_at: "true", precision: "full" });
  const response = await checkedFetch(`https://api.coingecko.com/api/v3/simple/price?${query}`, "CoinGecko");
  const data = await response.json() as Record<string, CoinGeckoRow>;
  return Object.fromEntries(ids.flatMap((id) => {
    const row = data[id];
    const usdt = Number(row?.usd || 0);
    return usdt > 0 ? [[id, { usdt, change24h: Number(row?.usd_24h_change || 0), lastUpdatedAt: Number(row?.last_updated_at || Math.floor(Date.now() / 1000)) }]] : [];
  })) as Record<string, NormalizedQuote>;
}

async function getEcbRates() {
  const response = await checkedFetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", "ECB", "application/xml");
  const xml = await response.text();
  const rate = (currency: string) => Number(xml.match(new RegExp(`currency=['\"]${currency}['\"]\\s+rate=['\"]([^'\"]+)`))?.[1]);
  const cny = rate("CNY");
  if (!cny) throw new Error("ECB 汇率格式异常");
  const rates = { ...SAFE_RATES, CNY: 1, EUR: cny };
  for (const currency of ["USD", "JPY", "HKD", "GBP", "CAD"] as MoneyCurrency[]) {
    const unitsPerEur = rate(currency);
    if (!unitsPerEur) throw new Error(`ECB 缺少 ${currency} 汇率`);
    rates[currency] = cny / unitsPerEur;
  }
  rates.USDT = rates.USD;
  return rates;
}

async function getCurrencyRates() {
  try { return { values: await getEcbRates(), source: "ECB" }; } catch { /* try independent fallback */ }
  try {
    const query = new URLSearchParams({ fsyms: "USDT", tsyms: MONEY_CURRENCIES.filter((currency) => currency !== "USDT").join(","), extraParams: "FlowLedger" });
    const response = await checkedFetch(`https://min-api.cryptocompare.com/data/pricemulti?${query}`, "CryptoCompare FX");
    const data = await response.json() as { USDT?: Partial<Record<MoneyCurrency, number>> };
    const cnyPerUsdt = Number(data.USDT?.CNY || 0);
    if (!cnyPerUsdt) throw new Error("CryptoCompare 汇率格式异常");
    const values = { ...SAFE_RATES, CNY: 1, USDT: cnyPerUsdt };
    for (const currency of MONEY_CURRENCIES.filter((item) => !["CNY", "USDT"].includes(item))) {
      const unitsPerUsdt = Number(data.USDT?.[currency] || 0);
      if (unitsPerUsdt) values[currency] = cnyPerUsdt / unitsPerUsdt;
    }
    return { values, source: "CryptoCompare" };
  } catch { return { values: SAFE_RATES, source: "安全估算" }; }
}

async function collectQuotes(ids: AssetId[]) {
  const quotes: Record<string, NormalizedQuote> = {};
  const used: string[] = [];
  const providers = [
    { name: "Binance", read: fromBinance },
    { name: "CryptoCompare", read: fromCryptoCompare },
    { name: "CoinGecko", read: fromCoinGecko },
  ];
  const wanted = ids.filter((id) => id !== "tether");
  const results = await Promise.allSettled(providers.map((provider) => provider.read(wanted)));
  for (const [index, result] of results.entries()) {
    if (result.status !== "fulfilled") continue;
    let contributed = false;
    for (const [id, row] of Object.entries(result.value)) {
      if (!quotes[id]) { quotes[id] = row; contributed = true; }
    }
    if (contributed) used.push(providers[index].name);
  }
  if (ids.includes("tether")) quotes.tether = { usdt: 1, change24h: 0, lastUpdatedAt: Math.floor(Date.now() / 1000) };
  const missing = ids.filter((id) => !quotes[id]);
  return { quotes, missing, source: used.join(" + ") || (ids.length === 1 && ids[0] === "tether" ? "USDT 锚定" : "暂无可用行情源") };
}

export async function GET(request: Request) {
  const now = Date.now();
  const ids = cleanIds(new URL(request.url).searchParams.get("ids"));
  const cacheKey = ids.join(",");
  if (cache && cache.expires > now && cache.payload.key === cacheKey) return Response.json(cache.payload);
  const persisted = lastGood?.key === cacheKey ? lastGood : await readPersistentCache(cacheKey);
  try {
    const [{ quotes: liveQuotes, missing: liveMissing, source }, fx] = await Promise.all([collectQuotes(ids), getCurrencyRates()]);
    const normalized = { ...liveQuotes };
    for (const id of liveMissing) {
      const previous = persisted?.quotes[id];
      if (previous) normalized[id] = { usdt: previous.usdt, change24h: previous.change24h, lastUpdatedAt: previous.lastUpdatedAt };
    }
    const missing = ids.filter((id) => !normalized[id]);
    if (ids.length && missing.length === ids.length) throw new Error(`行情源暂时无法提供：${missing.map((id) => ASSETS[id]).join("、")}`);
    const quotes = Object.fromEntries(ids.flatMap((id) => {
      const row = normalized[id];
      if (!row) return [];
      return [[id, { ...row, usd: row.usdt, cny: row.usdt * fx.values.USD }]];
    }));
    const payload: CachePayload = { key: cacheKey, rates: fx.values, quotes, fetchedAt: new Date().toISOString(), sources: { crypto: source, fx: fx.source }, stale: liveMissing.length > 0, estimatedFx: fx.source === "安全估算", missing };
    cache = { expires: now + 60_000, payload };
    lastGood = payload;
    await persistCache(payload);
    return Response.json(payload, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=120" } });
  } catch (error) {
    if (persisted) {
      lastGood = persisted;
      return Response.json({ ...persisted, stale: true, sources: { crypto: `${persisted.sources.crypto} · 持久缓存`, fx: `${persisted.sources.fx} · 持久缓存` } }, { headers: { "cache-control": "no-store" } });
    }
    return Response.json({ error: error instanceof Error ? error.message : "全部行情源暂不可用" }, { status: 502 });
  }
}
